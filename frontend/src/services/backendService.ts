// Backend API service for persistent task storage
// In Vite, process.env is not defined in the browser. Use import.meta.env instead.
import { simpleWalletService } from './simpleWalletService';
import { ethers } from 'ethers';

const DEFAULT_BACKEND_URL = (() => {
  try {
    const host = window.location?.hostname || 'localhost';
    // Use HTTPS if the page is served over HTTPS (production), otherwise HTTP (local dev)
    const protocol = window.location?.protocol === 'https:' ? 'https:' : 'http:';
    return `${protocol}//${host}:3001`;
  } catch {
    return 'http://localhost:3001';
  }
})();

// Prefer Vite env var if provided, otherwise fall back to same-host :3001
// Define VITE_BACKEND_URL in a .env file if you want a custom URL
// Example: VITE_BACKEND_URL=https://api.example.com
const BACKEND_URL =
  (typeof import.meta !== 'undefined' && (import.meta as any).env?.VITE_BACKEND_URL) ||
  DEFAULT_BACKEND_URL;

// Remove trailing slash if present
const CLEANED_BACKEND_URL = BACKEND_URL.replace(/\/$/, '');

console.log('🔗 Backend Service Configuration:', {
  VITE_BACKEND_URL: (import.meta as any).env?.VITE_BACKEND_URL,
  DEFAULT_BACKEND_URL,
  BACKEND_URL,
  CLEANED_BACKEND_URL
});

const buildAddressVariants = (address: string | undefined | null) => {
  if (!address) return [] as string[];

  const variants = new Set<string>();

  try {
    variants.add(address);
    variants.add(address.toLowerCase());
    variants.add(address.toUpperCase());
    variants.add(ethers.getAddress(address));
  } catch {
    variants.add(address);
    if (address?.toLowerCase) variants.add(address.toLowerCase());
    if (address?.toUpperCase) variants.add(address.toUpperCase());
  }

  return Array.from(variants);
};

console.log('🔗 Backend Service Configuration:', {
  VITE_BACKEND_URL: (import.meta as any).env?.VITE_BACKEND_URL,
  DEFAULT_BACKEND_URL,
  BACKEND_URL
});

class BackendService {
  private userAddress: string | null = null;

  setUserAddress(address: string) {
    try {
      this.userAddress = ethers.getAddress(address);
    } catch {
    this.userAddress = address;
    }
  }

  getUserAddress(): string {
    // If address is already set, use it
    if (this.userAddress) {
      return this.userAddress;
    }
    
    // Otherwise, try to get it from simpleWalletService
    try {
      const address = simpleWalletService.getAddress();
      if (address) {
        try {
          this.userAddress = ethers.getAddress(address);
        } catch {
          this.userAddress = address;
    }
    return this.userAddress;
      }
    } catch (error) {
      // If simpleWalletService is not available or wallet not connected, continue to throw error
    }
    
    throw new Error('User address not set');
  }

  async getTasks(): Promise<Record<string, any>> {
    try {
      const address = this.getUserAddress();
      const response = await fetch(`${CLEANED_BACKEND_URL}/api/tasks/${address}`);
      
      if (!response.ok) {
        throw new Error(`Failed to fetch tasks: ${response.statusText}`);
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch tasks from backend:', error);
      return {};
    }
  }

  async getTasksForAddress(address: string): Promise<Record<string, any>> {
    const variants = buildAddressVariants(address);

    let lastError: unknown = null;

    for (const candidate of variants) {
      if (!candidate) continue;

      try {
        const response = await fetch(`${CLEANED_BACKEND_URL}/api/tasks/${candidate}`);

        if (!response.ok) {
          lastError = new Error(`Failed to fetch tasks for address ${candidate}: ${response.statusText}`);
          continue;
        }

        const data = await response.json();

        if (data && Object.keys(data).length > 0) {
          console.log(`✅ Backend tasks fetched: ${Object.keys(data).length} task(s)`);
          return data;
        }

        // If empty, keep trying other variants before giving up
        lastError = new Error(`No tasks stored for address variant ${candidate}`);
      } catch (error) {
        lastError = error;
        console.warn(`⚠️ Failed to fetch tasks from backend for address variant ${candidate}:`, error);
      }
    }

    if (lastError) {
      console.warn(`⚠️ Could not fetch backend tasks for ${address}. Falling back.`, lastError);
    }

    return {};
  }

  async saveTask(taskData: any, taskIndex: number): Promise<void> {
    try {
      const address = this.getUserAddress();
      const response = await fetch(`${CLEANED_BACKEND_URL}/api/tasks/${address}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          taskIndex,
          taskData
        }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save task: ${response.statusText}`);
      }
      
      console.log('✅ Task saved to backend:', taskIndex);
    } catch (error) {
      console.error('Failed to save task to backend:', error);
      throw error;
    }
  }

  async updateTask(taskIndex: number, updates: any): Promise<void> {
    try {
      const address = this.getUserAddress();
      const response = await fetch(`${CLEANED_BACKEND_URL}/api/tasks/${address}/${taskIndex}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(updates),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to update task: ${response.statusText}`);
      }
      
      console.log('✅ Task updated on backend:', taskIndex);
    } catch (error) {
      console.error('Failed to update task on backend:', error);
      throw error;
    }
  }

  async deleteTask(taskIndex: number): Promise<void> {
    try {
      const address = this.getUserAddress();
      const response = await fetch(`${CLEANED_BACKEND_URL}/api/tasks/${address}/${taskIndex}`, {
        method: 'DELETE',
      });
      
      if (!response.ok) {
        throw new Error(`Failed to delete task: ${response.statusText}`);
      }
      
      console.log('✅ Task deleted from backend:', taskIndex);
    } catch (error) {
      console.error('Failed to delete task from backend:', error);
      throw error;
    }
  }

  async getDecryptedTasks(): Promise<number[]> {
    try {
      const address = this.getUserAddress();
      const response = await fetch(`${CLEANED_BACKEND_URL}/api/decrypted/${address}`);
      
      if (!response.ok) {
        return [];
      }
      
      return await response.json();
    } catch (error) {
      console.error('Failed to fetch decrypted tasks:', error);
      return [];
    }
  }

  async saveDecryptedTasks(ids: number[]): Promise<void> {
    try {
      const address = this.getUserAddress();
      const response = await fetch(`${CLEANED_BACKEND_URL}/api/decrypted/${address}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ ids }),
      });
      
      if (!response.ok) {
        throw new Error(`Failed to save decrypted tasks: ${response.statusText}`);
      }
      
      console.log('✅ Decrypted tasks saved to backend');
    } catch (error) {
      console.error('Failed to save decrypted tasks:', error);
      throw error;
    }
  }
}

export const backendService = new BackendService();

