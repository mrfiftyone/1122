-- Section 5: Automated Moderation (The Safety Shield)

-- Example table structures (Assuming they exist)
-- CREATE TABLE posts ( id UUID PRIMARY KEY, status TEXT DEFAULT 'active' );
-- CREATE TABLE users ( id UUID PRIMARY KEY, created_at TIMESTAMPTZ, posts_count INT DEFAULT 0 );
-- CREATE TABLE reports_ledger ( id UUID PRIMARY KEY, post_id UUID, student_id UUID, created_at TIMESTAMPTZ, UNIQUE(post_id, student_id) );

CREATE OR REPLACE FUNCTION process_post_report()
RETURNS TRIGGER AS $$
DECLARE
    reporter_created_at TIMESTAMPTZ;
    reporter_posts_count INT;
    report_weight DECIMAL;
    total_weighted_reports DECIMAL;
BEGIN
    -- 1. Get reporter stats to determine anti-brigading weight
    SELECT created_at, posts_count 
    INTO reporter_created_at, reporter_posts_count
    FROM public.users
    WHERE id = NEW.student_id;

    -- 2. Calculate weight: 
    -- If account is older than 48 hours AND has at least 1 post/comment, weight = 1.0
    -- Else, weight = 0.5 (to blunt coordinated brigading from fresh/bot accounts)
    IF (reporter_created_at < NOW() - INTERVAL '48 hours') AND (reporter_posts_count > 0) THEN
        report_weight := 1.0;
    ELSE
        report_weight := 0.5;
    END IF;

    -- Store the calculated weight in the ledger if we had a column for it, 
    -- but for this trigger, we just sum up the dynamic weights directly:
    
    -- Calculate new total weight for this post
    SELECT COALESCE(SUM(
        CASE 
            WHEN (u.created_at < NOW() - INTERVAL '48 hours' AND u.posts_count > 0) THEN 1.0
            ELSE 0.5
        END
    ), 0) + report_weight 
    INTO total_weighted_reports
    FROM public.reports_ledger rl
    JOIN public.users u ON u.id = rl.student_id
    WHERE rl.post_id = NEW.post_id;

    -- 3. If weighted reports hit 20, auto-hide the post instantly
    IF total_weighted_reports >= 20.0 THEN
        UPDATE public.posts
        SET status = 'hidden'
        WHERE id = NEW.post_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create the trigger on the ledger table
-- CREATE TRIGGER check_reports_threshold
-- AFTER INSERT ON reports_ledger
-- FOR EACH ROW
-- EXECUTE FUNCTION process_post_report();
