# What the data says to do

Written 20 Sep 2026, from 155 nights and 262 days of watch data, with three
periods labelled by hand: exams 15 Apr to 3 May, vacation 3 to 21 Aug, and
everything else.

Every figure here is measured against your own history, never a population.

## 1. The line is 02:00, not midnight

Two different things happen when you go to bed later, and they are not the
same thing.

**Sleep duration falls from midnight, in a straight line.** Roughly half an
hour of sleep lost for every hour later you go under, because your wake time
barely moves whatever you do the night before.

**Your heart ignores the clock until 02:00, then drops off a ledge.** With
rough nights taken out, the three buckets before 02:00 are flat:

| Asleep by | Resting HR | HRV | REM |
|---|---|---|---|
| before 00:00 | 52.0 | 71.0 | 1.16 h |
| 00:00 to 01:00 | 52.2 | 72.2 | 1.40 h |
| 01:00 to 02:00 | 52.8 | 70.4 | 1.32 h |
| **after 02:00** | **54.4** | **65.6** | **0.89 h** |

So there are two separate decisions, not one:

- **Want more sleep?** Every hour earlier is worth about 30 minutes. Midnight
  beats 01:00 beats 02:00, linearly.
- **Want to protect recovery?** Only one thing matters: do not cross 02:00.
  01:30 costs your heart nothing measurable. 02:30 costs 2 bpm and 6 ms.

This corrects what I told you first. I read a cliff at 01:00 and it was an
artefact of rough nights bunching into that bucket.

## 2. Rough nights are the real cost, and they are not late nights

A rough night is one where your body worked through the night instead of
resting: overnight stress a full standard deviation above your own 30 day
normal, and REM at 70% or less of normal. Nothing about the clock is in that
definition.

- 15 of 150 judgeable nights, about one a week
- Cost on the night: **+6.6 bpm** resting HR, **-18.8 ms** HRV
- Cost the next day: +0.45 bpm, -0.23 ms. Which is nothing.

Two things follow.

**It is a one day tax and nothing accumulates.** One bad night does not dig a
hole. Do not treat a single bad HRV reading as a trend, and do not change a
week's plan because of it.

**They are not short nights.** On the flagged nights you slept 6.5 to 7 hours,
which is ordinary for you. Something else was going on: food, alcohol,
a late hard session, or the day itself. Time in bed will not fix them.

The one intervention with evidence behind it: **zero rough nights in the 19
days of vacation.** Nineteen out of nineteen clean. That has never happened in
any other stretch of the year.

## 3. The vacation lesson is not "rest more"

This is the most useful thing in the dataset, because of what did *not* change.

| | Vacation | Ordinary day |
|---|---|---|
| Resting HR | 50.1 | 54.5 |
| HRV | 74.8 | 67.1 |
| Fell asleep | 00:29 | 01:25 |
| Steps | 7,569 | about the same |
| Garmin stress average | 38.0 | 40.7 |
| Body battery peak | 82.7 | 67.2 |

You did not move less. Your stress score barely moved. What moved was
**bedtime, by an hour**, and the complete absence of rough nights.

The recommendation is not "take more holidays". It is that an hour earlier to
bed, sustained, reproduces most of the vacation effect without the flights.

## 4. Stop reading the stress score

During exam season, the worst 19 days of your year:

| | Exams | Ordinary |
|---|---|---|
| Garmin stress average | 41.7 | 40.7 |
| High stress hours | 1.84 | 2.29 |
| Resting HR | 57.5 | 54.5 |
| HRV | 60.0 | 67.1 |
| Training readiness | 40.7 | 62.6 |

The stress score did not notice. High stress hours actually went **down**.
Meanwhile resting HR rose 3 bpm, HRV fell 7 ms, and readiness collapsed by a
third.

**Read resting HR, HRV and training readiness. Treat the stress score as
decoration.** It is the one number in the watch that failed the only real test
the year offered it.

## 5. A hard day costs you that night, reliably

With exams and vacation both excluded, so this is ordinary life only:

- Yesterday's active calories against tonight's HRV: **r = -0.41**
- Yesterday's active calories against tonight's resting HR: **r = +0.34**

These got *stronger* once the two unusual periods came out, which means it is
not an artefact of exam stress. A hard day genuinely costs the following
night.

Practical use: if you want a good HRV reading on a particular morning, the
lever is the *previous* day, not that night.

## 6. What to actually do

In order of evidence behind it:

1. **Treat 02:00 as a hard floor.** Below it, the clock costs you sleep but
   not recovery. Above it, both.
2. **Aim for an hour earlier than your current 01:25.** That is the whole
   vacation effect, and it is available on an ordinary Tuesday.
3. **Ignore single bad nights.** The cost is gone within a day and nothing
   stacks up.
4. **Judge a hard period by resting HR and HRV, never by the stress score.**
5. **Plan a hard session knowing it lands on tonight's recovery, not
   tomorrow's.**

## What is not in here

No recommendation is built on sleep score, body battery or the sleep stage
breakdown, because Garmin derives all of them from the same heart rate and HRV
signal. Using them to explain heart rate would be circular. Everything above
rests on resting HR, HRV, sleep timing and sleep duration, which are measured
independently.
