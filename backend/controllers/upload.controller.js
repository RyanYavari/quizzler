import pdfParse from "pdf-parse";

export const handleUpload = async (req, res) => {
  try {
    let content = "";

    if (req.file) {
      const { buffer, mimetype } = req.file;

      // No need to readFileSync anything — just use buffer
      if (mimetype === "application/pdf") {
        const data = await pdfParse(buffer);
        content = data.text;
      } else if (mimetype === "text/plain") {
        content = buffer.toString("utf8");
      } else {
        return res.status(400).json({ error: "Unsupported file type" });
      }

    } else if (req.body.text) {
      content = req.body.text;
      if (content.length > 10000) {
        return res.status(400).json({ error: "Text exceeds limit" });
      }
    } else {
      return res.status(400).json({ error: "No file or text provided" });
    }

    return res.status(200).json({
      message: "Upload successful",
      length: content.length,
      preview: content.slice(0, 300) + "..."
    });

  } catch (err) {
    console.error("Upload failed:", err.message);
    res.status(500).json({ error: "Failed to process content" });
  }
};
