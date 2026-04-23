import "dotenv/config";
import { AzureOpenAIEmbeddings } from "@langchain/openai";
import { FaissStore } from "@langchain/community/vectorstores/faiss";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));

let vectorStore = null;

async function getVectorStore() {
    if (vectorStore) return vectorStore;

    const embeddings = new AzureOpenAIEmbeddings({
        azureOpenAIApiEmbeddingsDeploymentName: process.env.AZURE_OPENAI_API_EMBEDDINGS_DEPLOYMENT_NAME,
    });

    vectorStore = await FaissStore.load(join(__dirname, "vectorstore"), embeddings);
    console.log("[embeddings] Vectorstore geladen");

    return vectorStore;
}

export async function searchDocuments(query, k = 3) {
    const store = await getVectorStore();
    const results = await store.similaritySearch(query, k);

    return results.map(doc => ({
        content: doc.pageContent,
        source: doc.metadata.source ?? "onbekend",
    }));
}
