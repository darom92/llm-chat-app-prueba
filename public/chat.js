/**
 * Frontend del chat: respuesta completa de una vez (sin streaming).
 */

// DOM elements
const chatMessages = document.getElementById("chat-messages");
const userInput = document.getElementById("user-input");
const sendButton = document.getElementById("send-button");
const typingIndicator = document.getElementById("typing-indicator");
const chips = document.querySelectorAll(".chip");

// Chat state
let chatHistory = [
	{
		role: "assistant",
		content: "¡Hola! Soy el asistente de WorkinBrands. ¿En qué puedo ayudarte?",
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

// Botón enviar
sendButton.addEventListener("click", () => sendMessage());

// Preguntas rápidas: envían el texto del botón
chips.forEach((chip) => {
	chip.addEventListener("click", () => sendMessage(chip.dataset.question));
});

/**
 * Envía el mensaje al backend y muestra la respuesta completa.
 * Si recibe un texto, lo usa; si no, lee el campo de entrada.
 */
async function sendMessage(text) {
	const message = (typeof text === "string" ? text : userInput.value).trim();

	// No enviar mensajes vacíos ni mientras se procesa otro
	if (message === "" || isProcessing) return;

	setBusy(true);

	// Mostrar el mensaje del usuario y limpiar la entrada
	addMessageToChat("user", message);
	userInput.value = "";
	userInput.style.height = "auto";

	typingIndicator.classList.add("visible");
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

		addMessageToChat("assistant", data.response);
		chatHistory.push({ role: "assistant", content: data.response });
	} catch (error) {
		console.error("Error:", error);
		addMessageToChat(
			"assistant",
			"Lo siento, ha ocurrido un error. Inténtalo de nuevo en unos minutos.",
		);
	} finally {
		typingIndicator.classList.remove("visible");
		setBusy(false);
		userInput.focus();
	}
}

/**
 * Activa o desactiva la entrada mientras se espera respuesta
 */
function setBusy(busy) {
	isProcessing = busy;
	userInput.disabled = busy;
	sendButton.disabled = busy;
	chips.forEach((chip) => (chip.disabled = busy));
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
