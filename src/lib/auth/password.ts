import bcrypt from 'bcryptjs'

/**
 * Password hashing. bcrypt with a per-password salt; cost 10 keeps sign-in
 * comfortably under ~100 ms on a small serverless instance while staying well
 * above the cost of a plain hash.
 */

const COST = 10

export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, COST)
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  try {
    return await bcrypt.compare(plain, hash)
  } catch {
    return false
  }
}

/**
 * Burns roughly the same time as a real comparison when the email does not
 * exist, so response timing does not reveal which accounts are registered
 * (AUTH-05).
 */
export async function fakeVerifyDelay(): Promise<void> {
  await bcrypt.compare('not-a-real-password', '$2a$10$CwTycUXWue0Thq9StjUM0uJ8DvW8gG2AH1w1ZC5JhFj5jVQMcVsGO')
}
