import React from 'react'
import { Button, Text } from '@chakra-ui/react'
import { useNavigate } from 'react-router-dom'


const HomePage = () => {

  const navigate = useNavigate()

  const handleStartClick = () => {
    navigate('/upload')
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '50vh' }}>
      
      <h1 style={{ fontSize: '4rem', marginBottom: '20px' }}> <Text
      as="span"
        fontSize="4rem"
        fontWeight="bold"
        textTransform="uppercase"
        color="blue.500">
        Quizzler
      </Text>   
        </h1>
      <h2 style={{ fontSize: '2rem', marginBottom: '20px' }}>An AI-Powered Quiz Chatbot</h2>
      <h3 style={{ marginBottom: '40px' }}>Upload any study material and get instant quiz questions!</h3>
      <Button
        size="lg" // Makes the button larger
        fontSize="1.5rem" // Increases the font size
        padding="1.5rem 2rem" // Adds more padding
        height="4rem" // Increases the height
        onClick={handleStartClick}
      >
        Start Now
      </Button>
    </div>
  )
}

export default HomePage
