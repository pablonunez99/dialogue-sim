// Ruta principal de conversacion: resuelve viaje, eventos, IA, y actualiza el estado del mundo
import { handleConversation } from './conversationController.js';

export function registerConversationRoutes(app) {
  app.post('/api/conversation', handleConversation);
}
