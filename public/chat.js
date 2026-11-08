/**
 * Frontend del chat: respuesta completa de una vez (sin streaming).
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");

// Chat state
let chatHistory = [
	{
		role: "assistant",
		content: "¡Hola! ¿En qué puedo ayudarte hoy?",
	},
];
let isProcessing = false;

// Auto-resize textarea as user types
userInput.addEventListener("input", function () {
	this.style.height = "auto";
	this.style.height = this.scrollHeight + "px";
});

// Send message on Enter (without Shift)
userInput.addEventListener("keydown", function (e) {
	if (e.key === "Enter" && !e.shiftKey) {
		e.preventDefault();
		sendMessage();
	}
});

// Send button click handler
sendButton.addEventListener("click", sendMessage);

/**
 * Envía el mensaje al backend y muestra la respuesta completa
 */
async function sendMessage() {
	const message = userInput.value.trim();

	// No enviar mensajes vacíos
	if (message === "" || isProcessing) return;

	// Desactivar la entrada mientras se procesa
	isProcessing = true;
	userInput.disabled = true;
	sendButton.disabled = true;

	// Mostrar el mensaje del usuario
	addMessageToChat("user", message);

	// Limpiar la entrada
	userInput.value = "";
	userInput.style.height = "auto";

	// Mostrar el indicador de "escribiendo"
	typingIndicator.classList.add("visible");

	// Guardar en el historial
	chatHistory.push({ role: "user", content: message });

	try {
		const response = await fetch("/api/chat", {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify({
				messages: chatHistory,
			}),
		});

		const data = await response.json();

		if (!response.ok || !data.response) {
			throw new Error(data.error || "Failed to get response");
		}

		// Mostrar la respuesta completa de una vez
		addMessageToChat("assistant", data.response);
		chatHistory.push({ role: "assistant", content: data.response });
	} catch (error) {
		console.error("Error:", error);
		addMessageToChat(
			"assistant",
			"Lo siento, ha ocurrido un error. Inténtalo de nuevo en unos minutos.",
		);
	} finally {
		// Ocultar el indicador
		typingIndicator.classList.remove("visible");

		// Reactivar la entrada
		isProcessing = false;
		userInput.disabled = false;
		sendButton.disabled = false;
		userInput.focus();
	}
}

/**
 * Añade un mensaje al chat.
 * Usa textContent para que el texto nunca se interprete como HTML.
 */
function addMessageToChat(role, content) {
	const messageEl = document.createElement("div");
	messageEl.className = `message ${role}-message`;

	const paragraph = document.createElement("p");
	paragraph.textContent = content;
	messageEl.appendChild(paragraph);

	chatMessages.appendChild(messageEl);
	chatMessages.scrollTop = chatMessages.scrollHeight;
}
