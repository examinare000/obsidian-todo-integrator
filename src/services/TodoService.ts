// TodoService interface for external todo service integration
// This interface provides a contract for implementing different todo services

import { TodoTask } from '../types';

/**
 * Options for filtering tasks
 */
export interface TaskFilterOptions {
	status?: 'notStarted' | 'inProgress' | 'completed';
	startDate?: string;
	endDate?: string;
	listId?: string;
}

/**
 * Options for creating a new task
 */
export interface CreateTaskOptions {
	title: string;
	description?: string;
	dueDate?: string;
	startDate?: string;
	listId?: string;
	importance?: 'low' | 'normal' | 'high';
}

/**
 * Options for updating an existing task
 */
export interface UpdateTaskOptions {
	title?: string;
	description?: string;
	status?: 'notStarted' | 'inProgress' | 'completed';
	dueDate?: string;
	startDate?: string;
	importance?: 'low' | 'normal' | 'high';
}

/**
 * Interface for external todo service integration
 * All implementations must provide these methods for todo operations
 */
export interface TodoService {
	/**
	 * Retrieve tasks from the external service
	 * @param options Optional filter options
	 * @returns Array of tasks matching the criteria
	 */
	getTasks(options?: TaskFilterOptions): Promise<TodoTask[]>;

	/**
	 * Create a new task in the external service
	 * @param task Task creation options
	 * @returns The created task with generated ID
	 */
	createTask(task: CreateTaskOptions): Promise<TodoTask>;

	/**
	 * Update an existing task
	 * @param taskId ID of the task to update
	 * @param updates Fields to update
	 * @returns The updated task
	 */
	updateTask(taskId: string, updates: UpdateTaskOptions): Promise<TodoTask>;

	/**
	 * Mark a task as completed
	 * @param taskId ID of the task to complete
	 * @returns The completed task
	 */
	completeTask(taskId: string): Promise<TodoTask>;

	/**
	 * Delete a task from the external service
	 * @param taskId ID of the task to delete
	 */
	deleteTask(taskId: string): Promise<void>;

	/**
	 * Get a specific task by ID
	 * @param taskId ID of the task to retrieve
	 * @returns The task if found, null otherwise
	 */
	getTaskById(taskId: string): Promise<TodoTask | null>;

	/**
	 * Search tasks by text query
	 * @param query Search string
	 * @returns Tasks matching the query
	 */
	searchTasks(query: string): Promise<TodoTask[]>;
}