import { auth, currentUser } from "@clerk/nextjs/server";
import { getOrCreateUser } from "@hassali/database";

export async function getCurrentDatabaseUser() {
  const { userId } = await auth();

  if (!userId) {
    return null;
  }

  const clerkUser = await currentUser();
  const primaryEmail =
    clerkUser?.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId)
      ?.emailAddress ??
    clerkUser?.emailAddresses[0]?.emailAddress ??
    `${userId}@clerk.local`;

  return getOrCreateUser({
    displayName: clerkUser?.fullName ?? clerkUser?.username ?? null,
    email: primaryEmail,
    externalId: userId,
    imageUrl: clerkUser?.imageUrl ?? null
  });
}
