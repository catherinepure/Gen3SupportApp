-- Allow anon role to SELECT ride_sessions and ride_telemetry
-- Web-admin uses anon key for direct PostgREST queries;
-- without these policies, queries return empty arrays.

-- ride_sessions: allow anon SELECT
CREATE POLICY "Anon read access on ride_sessions"
    ON ride_sessions FOR SELECT
    USING (true);

-- ride_telemetry: allow anon SELECT
CREATE POLICY "Anon read access on ride_telemetry"
    ON ride_telemetry FOR SELECT
    USING (true);
