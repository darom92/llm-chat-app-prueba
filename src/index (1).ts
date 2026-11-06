/**
 * Chat de ventas con Workers AI + AI Search (instancia "ventas").
 *
 * @license MIT
 */
import { Env, ChatMessage } from "./types";

// Model ID for Workers AI model
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

// Nombre de la instancia de AI Search que contiene la guía de ventas
const AI_SEARCH_INSTANCE = "ventas";

// Instrucciones base del asistente
const SYSTEM_PROMPT =
	"Eres un asistente de ventas. Responde en español, con honestidad y sin presionar al cliente. " +
	"Usa la información de referencia que se te proporciona. " +
	"Si la pregunta no está cubierta por esa información, dilo con claridad sin inventar.";

export default {
	/**
	 * Main request handler for the Worker
	 */
	async fetch(
		request: Request,
		env: Env,
		ctx: ExecutionContext,
	): Promise<Response> {
		const url = new URL(request.url);

		// Handle static assets (frontend)
		if (url.pathname === "/" || !url.pathname.startsWith("/api/")) {
			return env.ASSETS.fetch(request);
		}

		// API Routes
		if (url.pathname === "/api/chat") {
			// Handle POST requests for chat
			if (request.method === "POST") {
				return handleChatRequest(request, env);
			}

			// Method not allowed for other request types
			return new Response("Method not allowed", { status: 405 });
		}

		// Handle 404 for unmatched routes
		return new Response("Not found", { status: 404 });
	},
} satisfies ExportedHandler<Env>;

/**
 * Handles chat API requests
 */
async function handleChatRequest(
	request: Request,
	env: Env,
): Promise<Response> {
	try {
		// Parse JSON request body
		const { messages = [] } = (await request.json()) as {
			messages: ChatMessage[];
		};

		// Pregunta del cliente: el último mensaje con rol "user"
		const ultimoUsuario = [...messages].reverse().find((m) => m.role === "user");
		const pregunta = ultimoUsuario?.content ?? "";

		// Buscar la información relevante en AI Search (guía de ventas)
		let contexto = "";
		if (pregunta) {
			try {
				const resultado = await env.AI.autorag(AI_SEARCH_INSTANCE).aiSearch({
					query: pregunta,
				});
				contexto = resultado.response ?? "";
			} catch (error) {
				// Si la búsqueda falla, el chat sigue respondiendo solo con las instrucciones base
				console.error("Error en AI Search:", error);
			}
		}

		const systemPrompt = contexto
			? `${SYSTEM_PROMPT}\n\nInformación de referencia:\n${contexto}`
			: SYSTEM_PROMPT;

		// Usar nuestro mensaje de sistema (quita cualquiera que venga de la página)
		const mensajes = messages.filter((m) => m.role !== "system");
		mensajes.unshift({ role: "system", content: systemPrompt });

		const inputs = {
			messages: mensajes,
			max_tokens: 1024,
			stream: true,
		} satisfies AiTextGenerationInput & { stream: true };

		const stream = await env.AI.run<typeof MODEL_ID>(MODEL_ID, inputs);

		return new Response(stream, {
			headers: {
				"content-type": "text/event-stream; charset=utf-8",
				"cache-control": "no-cache",
				connection: "keep-alive",
			},
		});
	} catch (error) {
		console.error("Error processing chat request:", error);
		return new Response(
			JSON.stringify({ error: "Failed to process request" }),
			{
				status: 500,
				headers: { "content-type": "application/json" },
			},
		);
	}
}
