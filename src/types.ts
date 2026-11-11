export interface Env {
	AI: Ai;
	ASSETS: { fetch: (request: Request) => Promise<Response> };
	// Secreto privado para la herramienta de imágenes (Settings > Variables and Secrets)
	CLAVE_IMAGENES?: string;
}

export interface ChatMessage {
	role: "system" | "user" | "assistant";
	content: string;
}
