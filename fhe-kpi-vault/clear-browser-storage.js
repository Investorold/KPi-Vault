// Run this in the browser console to completely clear all FHEVM-related storage
// Copy and paste this entire script into the browser console and press Enter

console.log('🧹 Starting complete browser storage cleanup...');

// Clear localStorage
const localStorageKeys = [];
for (let i = 0; i < localStorage.length; i++) {
  const key = localStorage.key(i);
  if (key && (
    key.includes('fhevm') ||
    key.includes('relayer') ||
    key.includes('handle') ||
    key.includes('encryption') ||
    key.startsWith('zama_') ||
    key.includes('acl') ||
    key.includes('kms') ||
    key.toLowerCase().includes('fhe')
  )) {
    localStorageKeys.push(key);
  }
}
localStorageKeys.forEach(key => {
  console.log('Clearing localStorage:', key);
  localStorage.removeItem(key);
});

// Clear sessionStorage
const sessionStorageKeys = [];
for (let i = 0; i < sessionStorage.length; i++) {
  const key = sessionStorage.key(i);
  if (key && (
    key.includes('fhevm') ||
    key.includes('relayer') ||
    key.includes('handle') ||
    key.includes('encryption') ||
    key.startsWith('zama_')
  )) {
    sessionStorageKeys.push(key);
  }
}
sessionStorageKeys.forEach(key => {
  console.log('Clearing sessionStorage:', key);
  sessionStorage.removeItem(key);
});

// Clear IndexedDB
const dbNames = ['fhevm', 'relayer', 'zama', 'acl', 'kms', 'fhevm-handles', 'relayer-handles'];
dbNames.forEach(dbName => {
  try {
    const deleteReq = indexedDB.deleteDatabase(dbName);
    deleteReq.onsuccess = () => console.log('✅ Deleted IndexedDB:', dbName);
    deleteReq.onerror = () => console.log('⚠️ Failed to delete IndexedDB:', dbName);
  } catch (error) {
    console.log('⚠️ Error deleting IndexedDB:', dbName, error);
  }
});

// Try to delete all FHEVM-related IndexedDB databases
if ('databases' in indexedDB) {
  indexedDB.databases().then(databases => {
    databases.forEach(db => {
      if (db.name && (
        db.name.toLowerCase().includes('fhevm') ||
        db.name.toLowerCase().includes('relayer') ||
        db.name.toLowerCase().includes('zama') ||
        db.name.toLowerCase().includes('handle') ||
        db.name.toLowerCase().includes('acl') ||
        db.name.toLowerCase().includes('kms')
      )) {
        console.log('Deleting IndexedDB:', db.name);
        indexedDB.deleteDatabase(db.name);
      }
    });
  });
}

// Clear window.fhevm
if (window.fhevm) {
  console.log('Clearing window.fhevm');
  window.fhevm = undefined;
  delete window.fhevm;
}

console.log('✅ Cleanup complete! Please refresh the page (Ctrl+Shift+R) and try again.');
console.log('After refresh, the new code with fixes should be loaded.');

