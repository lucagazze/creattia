import { isAdminEmail } from './admin';

// Private preview: change this single switch only after product approval.
const publicVideoFeatureEnabled = false;

/** Videos stay in private preview until PUBLIC_VIDEO_FEATURE_ENABLED=true. */
export function canAccessVideoFeature(email?: string | null) {
	return publicVideoFeatureEnabled || isAdminEmail(email);
}
