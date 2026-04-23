import { RecursiveCharacterTextSplitter } from "@langchain/textsplitters";
import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { Document } from "@langchain/core/documents";
import { readFileSync, readdirSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const documentsDir = join(__dirname, "documents");

// Laad alle .txt bestanden uit de documents map
const files = readdirSync(documentsDir).filter(f => f.endsWith(".txt"));

const textSplitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 200,
});

let allChunks = [];

for (const file of files) {
    const text = readFileSync(join(documentsDir, file), "utf-8");

    const chunks = await textSplitter.createDocuments(
        [text],
        [{ source: file }]
    );

    allChunks.push(...chunks);
    console.log(`${file} → ${chunks.length} chunks`);
}

console.log(`Totaal: ${allChunks.length} chunks`);

// Embedden en opslaan als FAISS store
const embeddings = new AzureOpenAIEmbeddings({
    azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME,
});

const vectorStore = new FaissStore(embeddings, {});
await vectorStore.addDocuments(allChunks);
await vectorStore.save(join(__dirname, "vectorstore"));

console.log("✅ Vectorstore opgeslagen in /vectorstore");
