import { useState, useEffect, useRef } from 'react';
import { CheckCircle, Trash2, Share2, Clock, Shield, Eye, Users, ChevronDown, MessageSquare, Archive } from 'lucide-react';
import { format } from 'date-fns';
import type { Task } from '../types';

interface TaskCardProps {
  task: Task;
  onComplete: () => void;
  onDelete: () => void;
  onShare: () => void;
  onReply?: () => void; // New reply handler
  onDecrypt?: () => void;
  onArchive?: () => void; // Archive handler for received tasks
  // onViewHistory?: () => void;
  isDecrypted?: boolean;
  displayIndex?: number; // Add display index prop
  isSelectionMode?: boolean;
  isSelected?: boolean;
  onToggleSelection?: () => void;
}

export function TaskCard({ 
  task, 
  onComplete, 
  onDelete, 
  onShare, 
  onReply,
  onDecrypt,
  onArchive,
  /* onViewHistory, */ 
  isDecrypted = false, 
  displayIndex,
  isSelectionMode = false,
  isSelected = false,
  onToggleSelection
}: TaskCardProps) {
  const [showRecipients, setShowRecipients] = useState(false);
  const recipientsDropdownRef = useRef<HTMLDivElement>(null);
  
  // Get recipients - handle both array and single string
  const recipients = task.sharedWith || [];
  const hasRecipients = recipients.length > 0;

  const formatAddress = (address: string) => {
    if (!address) return '';
    return `${address.slice(0, 6)}...${address.slice(-4)}`;
  };

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (recipientsDropdownRef.current && !recipientsDropdownRef.current.contains(event.target as Node)) {
        setShowRecipients(false);
      }
    };

    if (showRecipients) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [showRecipients]);
  const getEncryptedDisplay = (type: string) => {
    const shortHashes = {
      title: '******* ********',
      description: '******* ********',
      dueDate: '*******',
      priority: '*******',
      status: '*******'
    };

    return shortHashes[type as keyof typeof shortHashes] || '*******';
  };
  const isOverdue = (() => {
    try {
      const dueDate = new Date(task.dueDate);
      return !isNaN(dueDate.getTime()) && dueDate < new Date() && task.status === 'Pending';
    } catch {
      return false;
    }
  })();
  
  const isDueSoon = (() => {
    try {
      const dueDate = new Date(task.dueDate);
      if (isNaN(dueDate.getTime())) return false;
      const now = new Date();
      const diffHours = (dueDate.getTime() - now.getTime()) / (1000 * 60 * 60);
      return diffHours <= 24 && diffHours > 0;
    } catch {
      return false;
    }
  })();

  const getPriorityColor = (priority: number) => {
    switch (priority) {
      case 1: return 'text-red-600 bg-red-50';
      case 2: return 'text-yellow-600 bg-yellow-50';
      case 3: return 'text-green-600 bg-green-50';
      default: return 'text-gray-600 bg-gray-50';
    }
  };

  const getPriorityText = (priority: number) => {
    switch (priority) {
      case 1: return 'High';
      case 2: return 'Medium';
      case 3: return 'Low';
      default: return 'Unknown';
    }
  };

  return (
    <div className={`card transition-all duration-200 hover:shadow-md ${
      isOverdue ? 'border-red-200 bg-red-50' : 
      isDueSoon ? 'border-yellow-200 bg-yellow-50' : 
      'border-zama-gray-200'
    } ${isSelected ? 'ring-2 ring-zama-yellow bg-yellow-50' : ''}`}>
      <div className="flex items-start justify-between">
        {/* Selection Checkbox */}
        {isSelectionMode && (
          <div className="flex items-center mr-4 mt-1">
            <input
              type="checkbox"
              checked={isSelected}
              onChange={onToggleSelection}
              className="w-4 h-4 text-zama-yellow bg-gray-100 border-gray-300 rounded focus:ring-zama-yellow focus:ring-2"
            />
          </div>
        )}
        
        <div className="flex-1">
          <div className="flex items-center space-x-2 mb-2">
            <div className="flex items-center space-x-2">
            <span className="text-sm font-bold text-zama-yellow bg-zama-black px-2 py-1 rounded">
              #{displayIndex !== undefined ? displayIndex + 1 : task.id + 1}
            </span>
              <h3 className="text-lg font-semibold text-zama-gray-900">
                {(task.isEncrypted && !isDecrypted) ? getEncryptedDisplay('title') : task.title}
              </h3>
            </div>
            <div className="flex items-center space-x-1">
              <Shield className="w-4 h-4 text-zama-yellow" />
              <span className="text-xs text-zama-gray-500">
                {(() => {
                  // If task was intended to be encrypted and is now decrypted, show Decrypted
                  if (isDecrypted && task.shouldEncrypt !== false) {
                    return 'Decrypted';
                  }
                  // Plain tasks (explicitly not encrypted)
                  if (task.shouldEncrypt === false) {
                    return 'Plain';
                  }
                  // Default encrypted state
                  return 'Encrypted';
                })()}
              </span>
            </div>
          </div>

          {task.description && (
            <p className="text-zama-gray-600 mb-3 line-clamp-2">
              {(task.isEncrypted && !isDecrypted) ? getEncryptedDisplay('description') : task.description}
            </p>
          )}

          <div className="flex items-center space-x-4 text-sm text-zama-gray-600 mb-3">
            <div className="flex items-center space-x-1">
              <Clock className="w-4 h-4" />
              <span>
                {(() => {
                  // Due date and priority are ALWAYS visible (encrypted tasks store these in metadata)
                  // Only check if it's actually a placeholder string
                  if (task.dueDate === '******* ********' || task.dueDate?.includes('*******')) {
                    return 'Encrypted';
                  }
                  try {
                    const date = new Date(task.dueDate);
                    return isNaN(date.getTime()) ? 'Invalid Date' : format(date, 'MMM dd, yyyy');
                  } catch (error) {
                    return 'Invalid Date';
                  }
                })()}
              </span>
            </div>
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${getPriorityColor(task.priority)}`}>
              {getPriorityText(task.priority)} Priority
            </div>
            <div className={`px-2 py-1 rounded-full text-xs font-medium ${
              task.status === 'Completed' 
                ? 'text-green-600 bg-green-50' 
                : 'text-blue-600 bg-blue-50'
            }`}>
              {(() => {
                // Plain tasks always show status
                if (!task.isEncrypted || task.shouldEncrypt === false) {
                  return task.status;
                }
                // Encrypted tasks show status only if decrypted
                return isDecrypted ? task.status : '*******';
              })()}
            </div>
          </div>

          {/* Status Indicators */}
          <div className="flex items-center space-x-4 text-xs text-zama-gray-500">
            {isOverdue && (
              <span className="text-red-600 font-medium">⚠️ Overdue</span>
            )}
            {isDueSoon && !isOverdue && (
              <span className="text-yellow-600 font-medium">⏰ Due Soon</span>
            )}
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center space-x-2 ml-4">
          {/* Only show decrypt button for encrypted tasks that aren't decrypted yet */}
          {!isDecrypted && onDecrypt && task.isEncrypted && task.shouldEncrypt !== false && (
            <button
              onClick={onDecrypt}
              className="p-2 text-zama-yellow hover:bg-zama-yellow hover:bg-opacity-20 rounded-lg transition-colors"
              title="Decrypt Task Data"
            >
              <Eye className="w-5 h-5" />
            </button>
          )}
          
          {/* Show complete button for tasks - but not for received tasks, and only if decrypted (for encrypted tasks) */}
          {task.status === 'Pending' && !task.originalOwner && 
           ((task.isEncrypted && task.shouldEncrypt !== false) ? isDecrypted : true) && (
            <button
              onClick={onComplete}
              className="p-2 text-green-600 hover:bg-green-50 rounded-lg transition-colors"
              title="Mark as Complete"
            >
              <CheckCircle className="w-5 h-5" />
            </button>
          )}
          
          {/* Edit functionality removed for privacy - tasks are immutable after creation */}
          
          {/* Reply button for received tasks - only show after decryption */}
          {isDecrypted && task.originalOwner && onReply && (
            <button
              onClick={onReply}
              className="p-2 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors"
              title="Reply to Task"
            >
              <MessageSquare className="w-5 h-5" />
            </button>
          )}
          
          {/* Archive button for received tasks - hide from inbox */}
          {task.originalOwner && onArchive && (
            <button
              onClick={onArchive}
              className="p-2 text-gray-600 hover:bg-gray-50 rounded-lg transition-colors"
              title="Archive Task"
            >
              <Archive className="w-5 h-5" />
            </button>
          )}
          
          {/* Only show share button for encrypted tasks (plain tasks cannot be shared) - and not for received tasks */}
          {isDecrypted && task.status !== 'Completed' && !task.isShared && task.isEncrypted && task.shouldEncrypt !== false && !task.originalOwner && (
            <button
              onClick={onShare}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="Share Task with Another User (Encrypted tasks only)"
            >
              <Share2 className="w-5 h-5" />
            </button>
          )}
          
          {/* Delete button - allow for my tasks; require decrypt first if encrypted. Hide for received tasks. */}
          {!task.originalOwner && (!task.isEncrypted || task.shouldEncrypt === false || isDecrypted) && (
            <button
              onClick={onDelete}
              className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
              title="Remove Task from List"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          )}
          
          {/* Blockchain Transaction History */}
          {/* {task.transactionHistory && Object.keys(task.transactionHistory).length > 0 && onViewHistory && (
            <button
              onClick={onViewHistory}
              className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
              title="View Blockchain Transaction History"
            >
              <History className="w-5 h-5" />
            </button>
          )} */}
          
          {/* Show shared indicator with recipients dropdown - only for tasks I own and shared (not received tasks) */}
          {task.isShared && !task.originalOwner && (
            <div className="relative" ref={recipientsDropdownRef}>
              <button
                onClick={() => setShowRecipients(!showRecipients)}
                className="flex items-center space-x-1 text-xs text-purple-600 bg-purple-50 px-2 py-1 rounded hover:bg-purple-100 transition-colors"
                title={hasRecipients ? `Shared with ${recipients.length} recipient(s)` : 'Shared'}
              >
                <Users className="w-3 h-3" />
                <span>{hasRecipients ? `${recipients.length}` : 'Shared'}</span>
                {hasRecipients && (
                  <ChevronDown className={`w-3 h-3 transition-transform ${showRecipients ? 'rotate-180' : ''}`} />
                )}
              </button>
              
              {/* Recipients Dropdown */}
              {showRecipients && hasRecipients && (
                <div className="absolute right-0 top-full mt-1 bg-white border border-purple-200 rounded-lg shadow-lg z-50 min-w-[280px] max-w-[350px]">
                  <div className="p-3 border-b border-purple-100">
                    <h4 className="text-xs font-semibold text-purple-900 flex items-center">
                      <Users className="w-3 h-3 mr-1" />
                      Shared with {recipients.length} recipient{recipients.length !== 1 ? 's' : ''}
                    </h4>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {recipients.map((recipient: string, index: number) => (
                      <div
                        key={index}
                        className="p-3 border-b border-purple-50 last:border-b-0 hover:bg-purple-50 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <div className="flex-1 min-w-0">
                            <p className="text-xs font-mono text-purple-900 truncate" title={recipient}>
                              {formatAddress(recipient)}
                            </p>
                            <p className="text-xs text-purple-600 mt-0.5 truncate" title={recipient}>
                              {recipient}
                            </p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          
          {task.status === 'Completed' && (
            <div className="flex items-center space-x-1 text-xs text-green-600 bg-green-50 px-2 py-1 rounded">
              <CheckCircle className="w-3 h-3" />
              <span>Completed</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
