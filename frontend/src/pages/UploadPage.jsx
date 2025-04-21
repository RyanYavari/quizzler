import React, { useState, useRef } from "react";
import {
  Box,
  Button,
  Textarea,
  Input,
  Spinner,
  VStack,
  Heading,
  Text,
  Icon
} from "@chakra-ui/react";
import { FiUploadCloud } from "react-icons/fi";
import axios from "axios";

const UploadPage = ({ onUploadComplete }) => {
  // State variables to manage file, text input, loading state, errors, and drag state
  const [file, setFile] = useState(null); // Stores the uploaded file
  const [rawText, setRawText] = useState(""); // Stores the text input
  const [loading, setLoading] = useState(false); // Indicates if the upload is in progress
  const [error, setError] = useState(""); // Stores error messages
  const inputRef = useRef(null); // Reference to the hidden file input
  const [dragging, setDragging] = useState(false); // Tracks if a file is being dragged over the drop area

  // Handles the upload process
  const handleUpload = async () => {
    setLoading(true); // Show loading spinner
    setError(""); // Clear any previous errors
    const formData = new FormData(); // Create a FormData object to send file or text

    // Validate and append file or text to the FormData object
    if (file) {
      if (file.size > 5 * 1024 * 1024) { // Check if file size exceeds 5MB
        setError("File size exceeds the 5MB limit.");
        setLoading(false);
        return;
      }
      formData.append("file", file); // Add file to FormData
    } else if (rawText.length > 10000) { // Check if text exceeds 10,000 characters
      setError("Text exceeds the 10,000 character limit.");
      setLoading(false);
      return;
    } else if (rawText.length < 250) { // Check if text is too short
      setError("Text must be at least 250 characters.");
      setLoading(false);
      return;
    } else {
      formData.append("text", rawText); // Add text to FormData
    }

    // Send the FormData to the backend
    try {
      await axios.post("/api/upload", formData); // Replace with your backend endpoint
      onUploadComplete(); // Callback function to handle successful upload
    } catch (error) {
      console.error("Upload failed:", error);
      setError("Upload failed. Please try again."); // Display error message
    } finally {
      setLoading(false); // Hide loading spinner
    }
  };

  // Handles file drop in the drag-and-drop area
  const handleDrop = (e) => {
    e.preventDefault();
    setDragging(false); // Reset dragging state
    if (e.dataTransfer.files.length > 0) {
      setFile(e.dataTransfer.files[0]); // Set the dropped file
      setRawText(""); // Clear text input if a file is selected
    }
  };

  // Handles drag-over event to indicate a file is being dragged
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragging(true); // Set dragging state to true
  };

  // Handles drag-leave event to reset the dragging state
  const handleDragLeave = () => setDragging(false);

  // Handles file selection via the file input
  const handleFileChange = (e) => {
    if (e.target.files.length > 0) {
      setFile(e.target.files[0]); // Set the selected file
      setRawText(""); // Clear text input if a file is selected
    }
  };

  // Styling for the drag-and-drop area
  const bg = "gray.700"; // Background color
  const border = dragging ? "2px dashed teal" : "2px dashed gray"; // Border style changes when dragging

  return (
    <Box
      display="flex"
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      minH="100vh"
      px={4}
    >
      {/* Main container for the upload page */}
      <VStack spacing={4} width="100%" maxWidth="550px">
        <Heading textAlign="center">Upload Your Study Material</Heading>

        {/* Display error messages */}
        {error && <Text color="red.500">{error}</Text>}

        {/* Drag-and-Drop Box */}
        <Box
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          bg={bg}
          border={border}
          borderRadius="xl"
          p={6}
          w="100%"
          textAlign="center"
          cursor="pointer"
          onClick={() => inputRef.current.click()} // Trigger file input on click
          transition="all 0.2s ease"
        >
          <VStack spacing={2}>
            <Icon as={FiUploadCloud} boxSize={10} color="teal.400" />
            <Text fontWeight="bold">Drag & Drop your PDF here</Text>
            <Text fontSize="sm" color="gray.500">
              or click to browse files
            </Text>
            <Input
              ref={inputRef}
              type="file"
              accept=".pdf,.txt" // Accept only PDF and text files
              hidden
              onChange={handleFileChange} // Handle file selection
            />
          </VStack>
        </Box>

        {/* Display selected file name */}
        {file && (
          <Text fontSize="sm" color="gray.600">
            Selected File: <strong>{file.name}</strong>
          </Text>
        )}

        {/* Text Input (Disabled if a file is selected) */}
        <Textarea
          placeholder="Or paste your content here..."
          value={rawText}
          onChange={(e) => setRawText(e.target.value)} // Update text input
          isDisabled={!!file} // Disable if a file is selected
          size="md"
          maxLength={10000} // Limit text to 10,000 characters
        />
        <Text fontSize="sm" color="gray.500">
          {rawText.length}/10000 characters {/* Display character count */}
        </Text>

        {/* Submit Button */}
        <Button
          onClick={handleUpload} // Trigger upload process
          colorScheme="teal"
          isDisabled={!(file || rawText)} // Disable if no file or text is provided
          width="100%"
        >
          Submit
        </Button>

        {/* Loading Spinner */}
        {loading && <Spinner />}
      </VStack>
    </Box>
  );
};

export default UploadPage;