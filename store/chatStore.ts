import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { RouteSummary, LocationResolutionAction, KwamePlace } from '../services/ai';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  routes?: RouteSummary[] | null;
  actionRequired?: LocationResolutionAction | null;
  places?: KwamePlace[] | null;
  suggestions?: string[] | null;
}

interface ChatState {
  messages: Message[];
  currentSessionId: string | null;
  isLoading: boolean;
  addMessage: (msg: Message) => void;
  updateMessageText: (id: string, newText: string) => void;
  clearHistory: () => void;
  loadHistory: (sessionId: string) => Promise<void>;
}

const DEFAULT_WELCOME_MESSAGE = (name: string): Message => ({
  id: 'welcome',
  role: 'assistant',
  text: `Sasa! I'm ${name}, your Navigo guide. Where are we heading today?`
});

export const useChatStore = create<ChatState>((set, get) => ({
  messages: [DEFAULT_WELCOME_MESSAGE('Kwame')],
  currentSessionId: null,
  isLoading: false,
  
  addMessage: (msg) => {
    const { messages, currentSessionId } = get();
    const updated = [...messages, msg];
    
    set({ messages: updated });
    
    if (currentSessionId) {
      const storageKey = `navigo_history_${currentSessionId}`;
      AsyncStorage.setItem(storageKey, JSON.stringify(updated)).catch(console.error);
    }
  },

  // This is the function that seamlessly swaps "Transcribing..." with real text
  updateMessageText: (id, newText) => {
    const { messages, currentSessionId } = get();
    const updated = messages.map(msg => 
      msg.id === id ? { ...msg, text: newText } : msg
    );
    
    set({ messages: updated });
    
    if (currentSessionId) {
      const storageKey = `navigo_history_${currentSessionId}`;
      AsyncStorage.setItem(storageKey, JSON.stringify(updated)).catch(console.error);
    }
  },
  
  clearHistory: () => {
    const { currentSessionId } = get();
    set({ messages: [DEFAULT_WELCOME_MESSAGE('Kwame')] });
    
    if (currentSessionId) {
      AsyncStorage.removeItem(`navigo_history_${currentSessionId}`).catch(console.error);
    }
  },
  
  loadHistory: async (sessionId) => {
    if (!sessionId) return;
    
    set({ isLoading: true, currentSessionId: sessionId });
    const storageKey = `navigo_history_${sessionId}`;
    
    try {
      const saved = await AsyncStorage.getItem(storageKey);
      if (saved) {
        const parsedMessages = JSON.parse(saved) as Message[];
        if (Array.isArray(parsedMessages)) {
          set({ messages: parsedMessages });
          return;
        }
      }
      set({ messages: [DEFAULT_WELCOME_MESSAGE('Kwame')] });
    } catch (e) {
      set({ messages: [DEFAULT_WELCOME_MESSAGE('Kwame')] });
    } finally {
      set({ isLoading: false });
    }
  }
}));