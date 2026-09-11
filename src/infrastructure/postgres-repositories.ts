import { SQL } from "bun";

export async function resetDatabase(db: SQL): Promise<void> {
  await db`TRUNCATE bookings, payment_attempts, payment_events, outbox_jobs, outbox_events, students, trial_classes, parents CASCADE`;
}

export async function seedDemo(db: SQL): Promise<void> {
  await resetDatabase(db);
  await db`INSERT INTO parents (id, name) VALUES ('p_ana', 'Ana'), ('p_budi', 'Budi'), ('p_cici', 'Cici'), ('p_dewi', 'Dewi') ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO students (id, parent_id, name) VALUES
    ('s_ana1', 'p_ana', 'Ana Jr 1'), ('s_ana2', 'p_ana', 'Ana Jr 2'),
    ('s_budi1', 'p_budi', 'Budi Jr 1'), ('s_cici1', 'p_cici', 'Cici Jr 1'),
    ('s_dewi1', 'p_dewi', 'Dewi Jr 1'), ('s_dewi2', 'p_dewi', 'Dewi Jr 2') ON CONFLICT (id) DO NOTHING`;
  const week = new Date(Date.now() + 7 * 86400 * 1000).toISOString();
  await db`INSERT INTO trial_classes (id, title, starts_at, maximum_capacity) VALUES
    ('c_math', 'Math Trial', ${week}::timestamptz, 4),
    ('c_robot', 'Robot Trial', ${week}::timestamptz, 4),
    ('c_science', 'Science Trial', ${week}::timestamptz, 4)
    ON CONFLICT (id) DO NOTHING`;
  // c_robot: Ana Jr 1 confirmed
  await db`INSERT INTO bookings (id, student_id, trial_class_id, status, accepted_payment_attempt_id) VALUES
    ('bk_r1', 's_ana1', 'c_robot', 'confirmed', 'pa_r1')
    ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO payment_attempts (id, booking_id, provider_invoice_id, status) VALUES
    ('pa_r1', 'bk_r1', 'inv_pa_r1', 'succeeded')
    ON CONFLICT (id) DO NOTHING`;
  await db`UPDATE trial_classes SET confirmed_count = 1 WHERE id = 'c_robot'`;
  // c_science: payment failure (re-book same child/class reuses bk_fail: duplicate case)
  await db`INSERT INTO bookings (id, student_id, trial_class_id, status) VALUES
    ('bk_fail', 's_ana1', 'c_science', 'payment_failed')
    ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO payment_attempts (id, booking_id, provider_invoice_id, status) VALUES
    ('pa_fail', 'bk_fail', 'inv_pa_fail', 'failed')
    ON CONFLICT (id) DO NOTHING`;
  // c_math: two confirmed + one seat held, awaiting payment (expires in 1 hour)
  await db`INSERT INTO bookings (id, student_id, trial_class_id, status, accepted_payment_attempt_id) VALUES
    ('bk_m1', 's_cici1', 'c_math', 'confirmed', 'pa_m1'),
    ('bk_m2', 's_ana2', 'c_math', 'confirmed', 'pa_m2')
    ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO payment_attempts (id, booking_id, provider_invoice_id, status) VALUES
    ('pa_m1', 'bk_m1', 'inv_pa_m1', 'succeeded'),
    ('pa_m2', 'bk_m2', 'inv_pa_m2', 'succeeded')
    ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO bookings (id, student_id, trial_class_id, status, hold_expires_at) VALUES
    ('bk_hold', 's_budi1', 'c_math', 'held', now() + interval '1 hour')
    ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO payment_attempts (id, booking_id, provider_invoice_id, status) VALUES
    ('pa_hold', 'bk_hold', 'inv_pa_hold', 'created')
    ON CONFLICT (id) DO NOTHING`;
  await db`UPDATE trial_classes SET confirmed_count = 3 WHERE id = 'c_math'`;
  // c_science: one confirmed + one payment failure (re-book reuses bk_fail: duplicate case)
  await db`INSERT INTO bookings (id, student_id, trial_class_id, status, accepted_payment_attempt_id) VALUES
    ('bk_s1', 's_dewi1', 'c_science', 'confirmed', 'pa_s1')
    ON CONFLICT (id) DO NOTHING`;
  await db`INSERT INTO payment_attempts (id, booking_id, provider_invoice_id, status) VALUES
    ('pa_s1', 'bk_s1', 'inv_pa_s1', 'succeeded')
    ON CONFLICT (id) DO NOTHING`;
  await db`UPDATE trial_classes SET confirmed_count = 1 WHERE id = 'c_science'`;
}
