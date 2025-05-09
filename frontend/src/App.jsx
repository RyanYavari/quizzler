import { Box } from '@chakra-ui/react';
import { Route, Routes } from 'react-router-dom';
import HomePage from './pages/HomePage';
import CreatePage from './pages/CreatePage';
import UploadPage from './pages/UploadPage';
import Navbar from './components/ui/Navbar';
import { useColorModeValue } from './components/ui/color-mode'; // Adjust the import path as necessary



function App() {

  const handleUploadComplete = () => {
    // Navigate to another page or show a success message
    console.log("Upload complete!");
  };

  
  return (
    
    <Box minH="100vh" bg={useColorModeValue("gray.100", "gray.800")}>
      <Navbar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/create" element={<CreatePage />} />
        <Route path="/upload" element={<UploadPage onUploadComplete={handleUploadComplete} />} />
      </Routes>
    </Box>
  );
}


export default App;


