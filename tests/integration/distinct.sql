--- setup -----------------------------------------------------------------

CREATE TABLE weather_reports (
  weather_report_id serial PRIMARY KEY,
  location text NOT NULL,
  time timestamptz NOT NULL,
  report TEXT NOT NULL
);

--- query -----------------------------------------------------------------

SELECT DISTINCT ON (location) location, time, report
FROM weather_reports
ORDER BY location, time DESC;

--- expected row count ----------------------------------------------------

many

--- expected column types -------------------------------------------------

location: text
time: Date
report: string

--- expected param types --------------------------------------------------
