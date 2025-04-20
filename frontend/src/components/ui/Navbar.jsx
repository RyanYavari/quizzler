
import {Button, Container, Flex, Text, HStack,  } from '@chakra-ui/react';
import { Link } from 'react-router-dom';
import { FaPlusSquare } from 'react-icons/fa';
import { IoMoon } from 'react-icons/io5';
import { LuSun } from 'react-icons/lu';
import { useColorMode } from './color-mode'; // Adjust the import path as necessary  
 // Adjust the import path as necessary


const Navbar = () => {

  const { colorMode, toggleColorMode } = useColorMode();

  return (
    <div>
      <Container maxW={"1140px"} px={4} >
        <Flex
          h={16}
          alignItems="center"
          justifyContent="space-between"
          flexDir={{
            base: "column",
            sm: "row"
          }}
        >

          <Text
            fontSize="28px"
            fontWeight="bold"
            textTransform="uppercase"
            color="blue.500"
            mr={8}
          >
            <Link to={"/"}>Quizzler</Link>
          </Text>

          <HStack spacing={2} alignItems={"center"}>
            <Link to={"/create"}>
              <Button>
                <FaPlusSquare />

              </Button>
            </Link>
            <Button onClick={toggleColorMode}>
              {colorMode === "light" ? <IoMoon /> : <LuSun size="20"/>}
            </Button>
          </HStack>
        </Flex>


      </Container>
    </div>
  );
}
//
export default Navbar
