---
title: Calibrating a Bench Scale
description: A placeholder essay that exercises every part of the essay page.
created: 2026-01-12
updated: 2026-03-04
status: draft
confidence: likely
importance: 6
tags: [fixtures, measurement]
written_by: by hand; this is test fixture text
published: 2026-02-20
also_on: https://example.com/p/calibrating-a-bench-scale
---

This essay is fixture text for the site's tests. It stands in for a real essay so the page can be checked without publishing anything. It is long enough to scroll, it has headings, lists, links and margin notes, and none of it says anything that matters.

A bench scale reads a load cell, converts the signal, and shows a number. Each of those steps can drift, and the drift is usually small enough to miss until two scales disagree about the same weight[^drift]. Calibration is the habit of noticing before that happens.

## Why the number moves

The load cell is a strip of metal with strain gauges bonded to it. When the metal bends, the gauges stretch, their resistance changes, and a bridge circuit turns that change into a voltage. The voltage is tiny, so it is amplified, and the amplifier has its own offset and its own temperature coefficient.

Temperature is the usual culprit. A scale calibrated in a cool morning reads differently in a warm afternoon, because the metal, the glue and the amplifier all respond to heat in slightly different ways. None of these effects is large on its own. Together they add up to the difference between a reading you trust and one you check twice.

Then there is creep. Leave a weight on the pan and the reading slowly rises for a few minutes as the metal relaxes. Take the weight off and the reading takes a while to return to zero. A careful procedure waits for the reading to settle before writing it down.

- Zero drift: the empty reading is not quite zero.
- Span drift: the reading for a known weight is off by a proportion.
- Linearity: the error is different at different loads.
- Hysteresis: the reading depends on whether the load is rising or falling.

## A procedure

Start with the scale on a level, solid surface, away from drafts and direct sun. Let it warm up for at least fifteen minutes. Tare it with the pan empty and note how far the empty reading wanders over a minute; that wander is the floor below which no reading means anything.

Place the reference weights one at a time, from light to heavy, and record each reading after it settles. Then remove them from heavy to light and record again. The two passes should agree within the scale's stated tolerance. If they do not, the gap between them is hysteresis, and no amount of adjustment will remove it[^hysteresis].

Fit a straight line through the readings. The offset of the line is the zero error and its slope is the span error. Most scales let you correct both. What is left after the correction is the linearity error, which you can only describe, not fix.

1. Level and warm up the scale.
2. Measure the zero wander over one minute.
3. Load the reference weights in rising order, then falling order.
4. Fit a line and correct zero and span.
5. Record the remaining error at each load.

## Writing it down

A calibration nobody can find is a calibration that did not happen. The record needs the date, the reference weights and their own certificates, the room temperature, the readings, the corrections and the remaining error. It also needs the name of whoever did it, because questions come up later and someone has to answer them.

The record is also how you notice slow drift. One calibration tells you the scale was right on that day. A year of them tells you how quickly it wanders, which tells you how often to check it. Some scales hold steady for months. Others need a weekly look.

It helps to keep the raw readings, not only the corrected ones. A correction that looked sensible at the time can turn out to be wrong, and the raw numbers let you redo it. Keeping them costs a few lines in a notebook.

## What the reading is for

Every number on the display is an answer to a question someone asked: how much flour, how much powder, how much metal. The precision the scale can give is only useful if it is more than the question needs. A kitchen scale that is good to a gram is plenty for bread and useless for medicine.

So the first step of any calibration is deciding what good enough means. Write the tolerance down before measuring, then compare the remaining error against it. If the error is inside the tolerance, the scale is fit for that use. If not, it may still be fit for another.

This is the part people skip. They calibrate to the best the scale can do, then use it for something that needed far less, or far more. The procedure was correct and the question was never asked.

## Checking between calibrations

A full calibration takes time, so most of the checking happens in between. A single known weight, placed on the pan each morning, catches most problems. If the reading is where it was yesterday, carry on. If it has moved, find out why before using the scale for anything that matters.

The daily check is not a calibration. It cannot tell you about linearity or hysteresis. It only tells you that nothing has changed much since the last full calibration, which is usually the thing you actually want to know.

Over time the daily checks build their own record. A slow trend in the check weight's reading is an early warning that the next full calibration will need a correction. A sudden jump means something happened: the scale was moved, dropped, or overloaded.

## Closing

None of this is difficult. It is mostly patience and a notebook. The scale is a small instrument with a simple job, and the work of keeping it honest is a small version of the work of keeping any measurement honest: know what you are asking, check against something you trust, write it down, and look again later.

That is the end of the fixture essay. If you are reading this on the live site, something has gone wrong with the build.

[^drift]: Two scales that agree on one weight can still disagree on another, which is why a single check weight is not a calibration.

[^hysteresis]: Hysteresis comes from the load cell's material and mounting. The fix is a better cell, not a better procedure.
