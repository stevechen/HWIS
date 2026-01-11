// See https://svelte.dev/docs/kit/types#app.d.ts
// for information about these interfaces
declare global {
	namespace App {
		// interface Error {}
		interface Locals {
			token: string | undefined;
			user:
				| {
						_id: string;
						name: string;
						email: string;
						role: 'teacher' | 'admin' | 'super' | 'student';
						status: 'active' | 'pending' | 'deactivated';
				  }
				| undefined;
			isTestMode: boolean;
		}
		// interface PageData {}
		// interface PageState {}
		// interface Platform {}
	}
}

export {};
