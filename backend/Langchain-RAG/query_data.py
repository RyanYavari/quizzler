from flask import Flask, request, jsonify
from langchain_chroma import Chroma
from langchain_openai import OpenAIEmbeddings, ChatOpenAI
from langchain.prompts import ChatPromptTemplate
import os
from dotenv import load_dotenv
from flask_cors import CORS
from werkzeug.utils import secure_filename
from create_database import generate_data_store
import subprocess

load_dotenv()

app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "*"}})

CHROMA_PATH = "chroma"

PROMPT_TEMPLATE = """
Answer the question based only on the following context:

{context}

---

Answer the question based on the above context: {question}
"""



prompt_template = ChatPromptTemplate.from_template(PROMPT_TEMPLATE)
model = ChatOpenAI()

@app.route("/query", methods=["POST"])
def query():
    embedding_function = OpenAIEmbeddings(openai_api_key=os.getenv("OPENAI_API_KEY"))
    db = Chroma(persist_directory=CHROMA_PATH, embedding_function=embedding_function)
    data = request.get_json()
    query_text = data.get("query")

    if not query_text:
        return jsonify({"error": "Query text is required."}), 400

    results = db.similarity_search_with_relevance_scores(query_text, k=3)

    if len(results) == 0 or results[0][1] < 0.7:
        return jsonify({"response": "Unable to find matching results.", "sources": []})

    context_text = "\n\n---\n\n".join([doc.page_content for doc, _score in results])
    prompt = prompt_template.format(context=context_text, question=query_text)
    response_text = str(model.invoke(prompt).content)

    sources = [doc.metadata.get("source", None) for doc, _score in results]

    return jsonify({
        "response": response_text,
        "sources": sources
    })
@app.route("/upload", methods=["POST"])
def upload():
    try:
        text = request.form.get("text")
        file = request.files.get("file")

        print(f"📥 Received text: {text[:100] if text else 'None'}")
        print(f"📥 Received file: {file.filename if file else 'None'}")

        if not text and not file:
            return jsonify({"error": "No input provided."}), 400

        os.makedirs("data", exist_ok=True)

        if file:
            filename = secure_filename(file.filename)
            file_ext = os.path.splitext(filename)[1].lower()
            if file_ext == ".pdf":
                save_path = os.path.join("data", filename)
            else:
                save_path = os.path.join("data", "data.md")
            file.save(save_path)
        elif text:
            save_path = os.path.join("data", "data.md")
            
            # Optional cleanup: overwrite data.md to clear old text
            with open(save_path, "w", encoding="utf-8") as f:
                f.write(text)

        print("🔄 Rebuilding vector database...")
        try:
            subprocess.run(["python", "create_database.py"], check=True)
        except subprocess.CalledProcessError as ve:
            print("❌ Vector DB generation failed:", ve)
            return jsonify({"error": "Vector DB failed."}), 500

        print("✅ Upload and embedding complete.")
        return jsonify({"message": "Upload and vector database update successful."})
    except Exception as e:
        print("❌ General upload error:", str(e))
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    app.run(debug=True)