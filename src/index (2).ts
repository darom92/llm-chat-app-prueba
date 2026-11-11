/**
 * Chat de ventas con Workers AI + AI Search (instancia "ventas"), sin streaming.
 * Incluye una herramienta privada de imágenes (/api/imagen, protegida con clave).
 *
 * @license MIT
 */
import { Env, ChatMessage } from "./types";

// Model ID for Workers AI model
// https://developers.cloudflare.com/workers-ai/models/
const MODEL_ID = "@cf/meta/llama-3.1-8b-instruct-fp8";

// Modelo de imágenes de Workers AI
const IMAGE_MODEL_ID = "@cf/black-forest-labs/flux-1-schnell";

// Modelo de edición de imágenes (acepta imágenes de entrada)
const EDIT_MODEL_ID = "@cf/black-forest-labs/flux-2-klein-4b";

// Nombre de la instancia de AI Search que contiene la guía de ventas
const AI_SEARCH_INSTANCE = "ventas";

// Instrucciones base del asistente
const SYSTEM_PROMPT =
	"Eres un asistente de ventas. Responde en español, con honestidad y sin presionar al cliente. " +
	"Usa la información de referencia que se te proporciona. " +
	"Si la pregunta no está cubierta por esa información, dilo con claridad sin inventar. " +
	"Nunca menciones documentos, guías ni fuentes; responde como si fuera tu propio conocimiento.";

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

		// Generación de imágenes (herramienta privada, protegida con clave)
		if (url.pathname === "/api/imagen") {
			if (request.method === "POST") {
				return handleImageRequest(request, env);
			}
			return new Response("Method not allowed", { status: 405 });
		}

		// Edición de imágenes con imágenes de entrada (herramienta privada)
		if (url.pathname === "/api/editar") {
			if (request.method === "POST") {
				return handleEditRequest(request, env);
			}
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

		// Respuesta completa de una vez (sin streaming)
		const resultado = await env.AI.run(MODEL_ID, {
			messages: mensajes,
			max_tokens: 1024,
		});

		return Response.json({ response: resultado.response ?? "" });
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

/**
 * Genera una imagen con FLUX.1 schnell (Workers AI).
 * Solo funciona con la clave privada guardada como secreto CLAVE_IMAGENES.
 */
async function handleImageRequest(request: Request, env: Env): Promise<Response> {
	try {
		const body = (await request.json()) as { prompt?: string; clave?: string };

		if (!env.CLAVE_IMAGENES || body.clave !== env.CLAVE_IMAGENES) {
			return Response.json({ error: "Clave incorrecta" }, { status: 401 });
		}

		const prompt = (body.prompt ?? "").trim();
		if (prompt.length < 5 || prompt.length > 1000) {
			return Response.json(
				{ error: "El prompt debe tener entre 5 y 1000 caracteres" },
				{ status: 400 },
			);
		}

		const resultado = (await env.AI.run(IMAGE_MODEL_ID, {
			prompt,
			steps: 4,
		})) as { image?: string };

		if (!resultado.image) {
			return Response.json({ error: "No se generó la imagen" }, { status: 500 });
		}

		return Response.json({ image: `data:image/jpeg;base64,${resultado.image}` });
	} catch (error) {
		console.error("Error generando imagen:", error);
		return Response.json({ error: "Error al generar la imagen" }, { status: 500 });
	}
}

/**
 * Edita una o varias imágenes según la instrucción (FLUX.2 klein 4B).
 * Las imágenes se envían como multipart: input_image_0, input_image_1, ...
 */
async function handleEditRequest(request: Request, env: Env): Promise<Response> {
	try {
		const formulario = await request.formData();
		const clave = String(formulario.get("clave") ?? "");

		if (!env.CLAVE_IMAGENES || clave !== env.CLAVE_IMAGENES) {
			return Response.json({ error: "Clave incorrecta" }, { status: 401 });
		}

		const prompt = String(formulario.get("prompt") ?? "").trim();
		if (prompt.length < 5 || prompt.length > 1000) {
			return Response.json(
				{ error: "La instrucción debe tener entre 5 y 1000 caracteres" },
				{ status: 400 },
			);
		}

		const imagenes = formulario.getAll("imagen").filter((v): v is File => v instanceof File);
		if (imagenes.length === 0 || imagenes.length > 4) {
			return Response.json({ error: "Sube entre 1 y 4 imágenes" }, { status: 400 });
		}

		// Construir el multipart que espera el modelo
		const entrada = new FormData();
		entrada.append("prompt", prompt);
		entrada.append("width", "1024");
		entrada.append("height", "1280");
		imagenes.forEach((imagen, i) => {
			entrada.append(`input_image_${i}`, imagen, `entrada-${i}.jpg`);
		});

		// Convertir el FormData en un cuerpo multipart con su cabecera
		const cuerpo = new Response(entrada);
		const contentType = cuerpo.headers.get("content-type") ?? "multipart/form-data";

		const resultado = (await env.AI.run(EDIT_MODEL_ID, {
			multipart: {
				body: cuerpo.body,
				contentType,
			},
		} as never)) as { image?: string };

		if (!resultado.image) {
			return Response.json({ error: "El modelo no devolvió imagen" }, { status: 500 });
		}

		return Response.json({ image: `data:image/jpeg;base64,${resultado.image}` });
	} catch (error) {
		console.error("Error editando imagen:", error);
		return Response.json({ error: "Error al editar la imagen" }, { status: 500 });
	}
}
