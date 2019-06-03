process.on('unhandledRejection', up => { throw up })

// Dependencies
const express = require("express");
const logger = require("morgan");
const mongoose = require("mongoose");
const path = require("path");

// Requiring Note and Article models
const db = require("./models");

// Scraping tools
const cheerio = require("cheerio");

//Define port
const port = process.env.PORT || 3000

// Initialize Express
const app = express();
app.use(logger("dev"));


// Make public a static dir
app.use(express.static("public"));

// Set Handlebars, ty github.com/llh914.
const exphbs = require("express-handlebars");

app.engine("handlebars", exphbs({
    defaultLayout: "main",
    partialsDir: path.join(__dirname, "/views/layouts/partials")
}));
app.set("view engine", "handlebars");

// If deployed, use the deployed database. Otherwise use the local mongoHeadlines database
const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost/mongoHeadlines";

mongoose.connect(MONGODB_URI, { useNewUrlParser: true }, { useFindAndModify: false });

// Routes
// ======

//GET requests to render Handlebars pages
app.get("/", function (req, res) {
    db.Article.find({
        saved: false
    }, function (error, data) {
        const hbsObject = {
            article: data
        };
        console.log(hbsObject);
        res.render("home", hbsObject);
    });
});

app.get("/saved", function (req, res) {
    db.Article.find({
        saved: true
    }).populate("notes").exec(function (error, articles) {
        const hbsObject = {
            article: articles
        };
        res.render("saved", hbsObject);
    });
});

// A GET request to scrape the echojs website
app.get("/scrape", function (req, res) {
    // First, we grab the body of the html with request
    axios.get("https://www.nytimes.com/").then(function (response) {
        // Then, we load that into cheerio and save it to $ for a shorthand selector
        const $ = cheerio.load(response.data);
        // Now, we grab every h2 within an article tag, and do the following:
        $("article").each(function (i, element) {
            // Save an empty result object
            const result = {};
            // Add the text and href of every link, and save them as properties of the result object
            result.title = $(this)
                .children("a")
                .text();
            result.link = $(this)
                .children("a")
                .attr("href");
            // Create a new Article using the `result` object built from scraping
            db.Article.create(result)
                .then(function (dbArticle) {
                    // View the added result in the console
                    console.log(dbArticle);
                })
                .catch(function (err) {
                    // If an error occurred, log it
                    console.log(err);
                });
        });
        // Tell the browser that we finished scraping the text
        res.send("Scrape Complete");

    });
});

// Route for getting all Articles from the db
app.get("/articles", function (req, res) {
    // Grab every document in the Articles collection
    db.Article.find({})
        .then(function (dbArticle) {
            // If we were able to successfully find Articles, send them back to the client
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});

// Route for grabbing a specific Article by id, populate it with it's note
app.get("/articles/:id", function (req, res) {
    // Using the id passed in the id parameter, prepare a query that finds the matching one in our db...
    db.Article.findOne({
            _id: req.params.id
        })
        // ..and populate all of the notes associated with it
        .populate("note")
        .then(function (dbArticle) {
            // If we were able to successfully find an Article with the given id, send it back to the client
            res.json(dbArticle);
        })
        .catch(function (err) {
            // If an error occurred, send it to the client
            res.json(err);
        });
});


// Save an article
app.post("/articles/save/:id", function (req, res) {
    // Use the article id to find and update its saved boolean
    db.Article.findOneAndUpdate({
            _id: req.params.id
        }, {
            saved: true
        })
        // Execute the above query
        .then(function (err, doc) {
            // Log any errors
            if (err) {
                console.log(err);
            } else {
                // Or send the document to the browser
                res.send(doc);
            }
        });
});

// Delete an article
app.post("/articles/delete/:id", function (req, res) {
    // Use the article id to find and update its saved boolean
    db.Article.findOneAndUpdate({
            _id: req.params.id
        }, {
            saved: false,
            notes: []
        })
        // Execute the above query
        .then(function (err, doc) {
            // Log any errors
            if (err) {
                console.log(err);
            } else {
                // Or send the document to the browser
                res.send(doc);
            }
        });
});


// Create a new note
app.post("/notes/save/:id", function (req, res) {
    // Create a new note and pass the req.body to the entry
    const newNote = new Note({
        body: req.body.text,
        article: req.params.id
    });
    console.log(req.body)
    // And save the new note the db
    newNote.save(function (error, note) {
        // Log any errors
        if (error) {
            console.log(error);
        }
        // Otherwise
        else {
            // Use the article id to find and update it's notes
            db.Article.findOneAndUpdate({
                    _id: req.params.id
                }, {
                    $push: {
                        notes: note
                    }
                })
                // Execute the above query
                .then(function (err) {
                    // Log any errors
                    if (err) {
                        console.log(err);
                        res.send(err);
                    } else {
                        // Or send the note to the browser
                        res.send(note);
                    }
                });
        }
    });
});

// Delete a note
app.delete("/notes/delete/:note_id/:article_id", function (req, res) {
    // Use the note id to find and delete it
    db.Note.findOneAndRemove({
        _id: req.params.note_id
    }, function (err) {
        // Log any errors
        if (err) {
            console.log(err);
            res.send(err);
        } else {
            db.Article.findOneAndUpdate({
                    _id: req.params.article_id
                }, {
                    $pull: {
                        notes: req.params.note_id
                    }
                })
                // Execute the above query
                .then(function (err) {
                    // Log any errors
                    if (err) {
                        console.log(err);
                        res.send(err);
                    } else {
                        // Or send the note to the browser
                        res.send("Note Deleted");
                    }
                });
        }
    });
});

// Listen on port
app.listen(port, function () {
    console.log("App running on port " + port);
});