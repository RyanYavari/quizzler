import express from 'express';
import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from './config/db.js';
import Product from './models/product.model.js';
import productRoutes from "./routes/product.route.js"




/*
    In this method we will create our API through POST, GET, PUT, and DELETE. These commands will make requests and retrieve responses with our MongoDB database. 
*/


dotenv.config();

const app = express();

app.use(express.json()); //allows us to accept JSON data in the req.body



app.use("/api/products", productRoutes)


// Connect database

app.listen(8000, () => {
    connectDB();
    console.log("Server started at http://localhost:8000")
    
})
 


