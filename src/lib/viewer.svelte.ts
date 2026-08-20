import { useAuth } from '@mmailaender/convex-better-auth-svelte/svelte';
import { useQuery } from 'convex-svelte';
import { api } from '$convex/_generated/api';
import { settleViewer, type AuthInput, type ProfileInput, type ViewerSession } from './viewer-core';

export type { Viewer, SessionStatus, ViewerSession } from './viewer-core';

export class ViewerSessionImpl implements ViewerSession {
	private readonly auth = useAuth();
	private readonly profile = useQuery(api.users.profile, () => ({}));

	get status(): ViewerSession['status'] {
		return settleViewer(this.auth, this.profile).status;
	}

	get viewer(): ViewerSession['viewer'] {
		return settleViewer(this.auth, this.profile).viewer;
	}

	get actor(): ViewerSession['actor'] {
		return settleViewer(this.auth, this.profile).actor;
	}

	get capabilities(): ViewerSession['capabilities'] {
		return settleViewer(this.auth, this.profile).capabilities;
	}

	get isStudent(): ViewerSession['isStudent'] {
		return settleViewer(this.auth, this.profile).isStudent;
	}

	get isEnrolled(): ViewerSession['isEnrolled'] {
		return settleViewer(this.auth, this.profile).isEnrolled;
	}

	get isAdmin(): ViewerSession['isAdmin'] {
		return settleViewer(this.auth, this.profile).isAdmin;
	}

	get isTeacher(): ViewerSession['isTeacher'] {
		return settleViewer(this.auth, this.profile).isTeacher;
	}

	get isApproved(): ViewerSession['isApproved'] {
		return settleViewer(this.auth, this.profile).isApproved;
	}

	get needsProfileCreation(): ViewerSession['needsProfileCreation'] {
		return settleViewer(this.auth, this.profile).needsProfileCreation;
	}
}

export function useViewer(): ViewerSession {
	return new ViewerSessionImpl();
}

export type { AuthInput, ProfileInput };
