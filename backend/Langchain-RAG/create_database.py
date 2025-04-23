from langchain_community.vectorstores import Chroma
from langchain_community.document_loaders import DirectoryLoader
from langchain.text_splitter import RecursiveCharacterTextSplitter
from langchain.schema import Document
from langchain_openai import OpenAIEmbeddings
import openai
from dotenv import load_dotenv
import os


load_dotenv()

api_key = os.getenv("OPENAI_API_KEY")

if not api_key:
    raise ValueError("❌ OPENAI_API_KEY not found in environment variables.")

openai.api_key = api_key
print("✅ OpenAI API key loaded successfully.")

CHROMA_PATH = "chroma"
DATA_PATH = "data"


def main():
    generate_data_store()


def generate_data_store():
    print("📚 Loading documents...")
    documents = load_documents()
    print(f"✅ Loaded {len(documents)} document(s).")

    print("🧠 Splitting text...")
    chunks = split_text(documents)
    print(f"✅ Got {len(chunks)} chunks.")

    print("💾 Saving to Chroma...")
    save_to_chroma(chunks)
    print("✅ Chroma DB updated.")



def load_documents():
    loader = DirectoryLoader(DATA_PATH, glob="*.md", recursive=False)
    pdf_loader = DirectoryLoader(DATA_PATH, glob="*.pdf", recursive=False)
    documents = loader.load() + pdf_loader.load()
    return documents



def split_text(documents: list[Document]):
    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=300,
        chunk_overlap=100,
        length_function=len,
        add_start_index=True,
    )
    chunks = text_splitter.split_documents(documents)
    print(f"Split {len(documents)} documents into {len(chunks)} chunks.")

    if chunks:
        sample = chunks[min(50, len(chunks) - 1)]
        print(sample.page_content)
        print(sample.metadata)
    else:
        print("⚠️ No chunks were created.")

    return chunks


def save_to_chroma(chunks: list[Document]):
    print("💾 Saving to Chroma...")

    # This will save to disk
    db = Chroma.from_documents(
        documents=chunks,
        embedding=OpenAIEmbeddings(openai_api_key=os.getenv("OPENAI_API_KEY")),
        persist_directory=CHROMA_PATH
    )

    # Add this to ensure it persists properly
    db.persist()

    print(f"✅ Saved {len(chunks)} chunks to {CHROMA_PATH}")


if __name__ == "__main__":
    main()