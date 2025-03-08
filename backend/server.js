import express from 'express';

const app = express();

app.get("/products", (req, res) => {
    res.send("Server is ready woo");
    res
})

app.listen(5000, () => {
    console.log("Server started at http://localhost:5000")
})
