# Nilay About

`@sasakiuri/nilay-about` is the site for Nilay's services at <https://about.nilay.jp>.
It carries information on shooting, hunting and wildlife damage control, the news, a contact form, and the Labs tools.

It is built with Next.js 16 (App Router), React 19, TypeScript and Tailwind CSS 4.
The news comes from microCMS, and contact messages are sent to a Slack webhook.
The main site (`/`, `/news`, `/contact` and the `/labs` list) has a retro design;
each Labs tool has its own Material Design layout.

## Language

The site can be shown in Japanese or English. The switch is "言語 (Language)" in the header, and each Labs tool
also has a language menu at the top right. Both change the same single setting.

The chosen language is saved in the browser (key `nilay-language-v1`) and used again on the next visit.
If a setting remains from when each Labs tool saved its own language, that language is carried over once.
The `lang` attribute of the `html` element follows the language shown, so screen readers do not read English with Japanese pronunciation.

Because the language is kept in the browser rather than in the URL:

- Each page has one URL. Links and bookmarks are the same in either language.
- The server does not know the reader's language, so a page first renders in Japanese and switches after it loads.
- `title`, `description` and the Open Graph values are generated on the server and stay in Japanese. Search results show the Japanese page.
- News articles are stored in microCMS in Japanese only, so an article stays in Japanese when the site is in English.
  Only what surrounds it, such as headings and date formats, changes. Articles carry `lang="ja"`.
- The law quiz, the trap and net tags, the game meat capture record and the cartridge purchase plan deal with Japanese statutes and official forms,
  so they are in Japanese only. The Labs list says so.

## Labs

The `/labs` list uses the main site's design and links to each tool, grouped by what it is for.
The tools need no sign-up. The tools are listed below.
Each tool's name, list summary, search description and category are kept in one place, `lib/labs-tools.ts`.
The list, the title in each tool's app bar, the page `title` and `description`, the sitemap and the structured data all read from it.
Each tool page ends with links to the other tools in its category.

The server renders every tool with its default values, so the page HTML already contains the tool.
Until the browser has read what was saved, the tool is held inert and `aria-busy`; it then shows the saved values.
The Playwright specs import `test` from `__tests__/e2e/fixtures.ts`, which waits for that after each `goto` and `reload`.

Every tool has a fixed bar at the top with two actions always available: back to the Labs list, and switch language.
The 18 tools that keep inputs or measurements also have a reset button (入力を初期値に戻す) there.
Trap and net tags uses 保存した内容を削除 (delete saved input) in its card instead, and the two tests use the action that returns to the test settings.
The reset says what will be cleared and asks for confirmation. Named setups, places and records are kept.
In group size and shotgun pattern measurement it clears the photo, the scale, the recorded points and the inputs; saved measurements are kept.
The long tools (ballistic calculator, group size, shot pellets, shotgun pattern, maximum range, trajectory truing,
velocity spread, twist rate and stability, recoil) show section links under the fixed bar.
Calculation, printing and measurement tools show the answer right after the inputs that change most often; on wide screens
it sits to the right of the inputs so it stays in view while typing.
Conditions that rarely change, such as the atmosphere or the table range, are collapsed with their current values in the heading,
and stay open while an input in them is invalid.
Units are chosen inside each number field. On narrow screens, recoil and shot pellets show conditions A and B one at a time with a switch.

- **Game Species Identification** (狩猟鳥獣の判別練習): look at a photo, reveal the answer, and mark it わかった (knew it) or 要復習 (to review).
  Choose all species, birds or mammals, and the number of questions (all, or up to 5, 10 or 20). Photos can be enlarged, and a session can be resumed.
  At the end, the answers marked for review and those left unmarked are listed, and selected species can be studied again.
  Autoplay shows the photo and then the answer, at 3, 5 or 10 second intervals. It does not mark answers.
  The identification test is multiple choice with four options; choose the species, the number of questions and a time limit per question
  (5 s, 10 s or none). Results are shown together at the end, and only wrong and unanswered species are added to the review list.
  Correct answers do not change the self-marked record.
  Because of the time limit, progress is not saved and a reload discards it. Only the 46 game species are asked; the hare (ノウサギ) and the mountain hare (ユキウサギ) share one question, so there are 45.
  本番形式 (exam style) mixes the game species with 23 non-game species that are easily mistaken for them (photos credited below):
  16 photos, 5 s, 10 s or no limit each, first 狩猟鳥獣 (game) or not, and for game, the name from four.
  The 16 photos, about 5 seconds and the two answers follow Kochi Prefecture's notice for the licence exam (updated 2024-06-28).
  Birds and mammals, mammals only (the trap licence judges mammals only, regulation art. 53) or birds only.
  The points taken off per mistake are not published, so the results count wrong status, wrong name and no answer instead of a score.
  It is not saved. The look-alike section shows each non-game species beside the game species it is set against.
- **Hunting and Firearms Law Quiz** (狩猟・銃砲の法令テスト): 97 multiple-choice questions in 12 topics,
  drawn from four acts and their cabinet orders, Cabinet Office orders and ministerial ordinances:
  the Wildlife Protection and Management Act (鳥獣保護管理法: hunting basics, licences and registration, area and season restrictions,
  restricted methods, restrictions and safety for gun hunting, duties, reports and penalties after capture),
  the Firearms and Swords Control Act (銃刀法: possession and licensing, duties and storage after licensing, ranges and practice),
  the Explosives Control Act (火薬類取締法: handling explosives, acquiring and using cartridges),
  and the Ordnance Manufacturing Act (武器等製造法: manufacturing and selling hunting guns).
  Questions can be chosen by act or by topic, and the number of questions is 5, 10, 20 or all.
  やめる (quit) returns to the test settings at any point; if any question has been answered, it asks before discarding.
  Each answer immediately shows whether it was right, with the article number and a summary of the text.
  Wrong and unanswered questions are added to the review list and can be retried on their own. Answering correctly does not remove them.
  The articles were checked against e-Gov Law Search, and the date checked and the laws referred to are shown on screen.
- **Hunting Licence and Firearms Course Practice** (狩猟免許試験・考査の練習): practice for the knowledge test of the hunting licence exam
  and for the test at the end of the beginners' firearms course (猟銃等講習会の考査). Choose the exam and, for the licence exam, the licence
  (網猟, わな猟, 第一種銃猟, 第二種銃猟); only the gear questions differ between licences.
  The law questions are the law quiz's wildlife questions cut to three choices (the answer and two of its wrong choices).
  The gear, wildlife and management questions (three choices) and the course items (true or false) were written from the act and its regulation,
  the National Police Agency circular on the course test (令和7年11月28日 丁保発第224号, appendix 3 model statements; false items change one point of a statement),
  and Ministry of the Environment guidance. Each answer shows its explanation and source. No textbook, question book or other site was used.
  Practice draws 10, 20, 30 or all questions from one area or all; 今日のテスト (today's test) is 10 questions fixed by the date, exam and licence.
  The mock exam follows published figures: the licence exam is 30 three-way questions (law 13, gear 6, wildlife 9, management 2) in 90 minutes
  with 70% to pass (regulation art. 54; count, time and split from Kochi Prefecture's notice), or 10 gear questions in 30 minutes for holders of another licence
  (Tokyo's notice); the course test is 50 true-or-false questions in 60 minutes with 45 to pass, split by the circular's syllabus weights.
  Answers are not marked until the paper is handed in; questions can be revisited and flagged, and the clock hands it in at zero.
  Results show the pass verdict and the rate per area.
  Spaced repetition: a missed question is due at once; each right answer moves it out to 1 day, then 3 days, and three right in a row marks it learnt (習得済み).
  Settings, the session in progress and the record are saved in this browser.
- **Shoot or Hold, and Where to Aim** (撃つか撃たないかの判断と急所): 15 scenes with deer, wild boar and bears, each a drawing and a
  short situation (date, time, place). Choose 撃つ (shoot), or 撃たない (hold) and the reason: no backstop you can see, target not identified,
  people, buildings or roads in range, ricochet, before sunrise or after sunset, a place where shooting is not allowed, out of season,
  or an animal that may not be taken. Each answer shows the explanation and its source: articles 2, 11, 34-2 and 38 of the act,
  articles 7, 8 and 10 and appended table 2 of its regulation, the police circular's model statements on handling,
  and the Ministry of the Environment's text for certified capture operators (2026-01) and emergency shooting guideline (2026-04).
  Where to aim: tap a side view of a deer, boar or bear, then see the head (brain), neck (vertebrae) and chest (heart and lungs) zones.
  The drawings are schematic and made for this tool; the zones follow the emergency shooting guideline (bear and boar, pp. 107-110)
  and Hokkaido's deer capture text (2020, pp. 3-9), quoted under the drawing. Answers are not saved.
- **Study streak and exam countdown** (all study tools): the species identification, the law quiz, the licence exam practice and shoot or hold show the days studied in a row,
  the longest run and the days left to an exam date. A day counts once a question is answered. The record is shared by the study tools
  under one key (`nilay-study-log-v1`) and kept in this browser only.
  The range standards come from the Cabinet Office Order on the Designation of Designated Shooting Ranges, and the cartridge quantities
  from the Cabinet Office Order on the Transfer, Acquisition, Import and Consumption of Explosives for Hunting Guns.
  This is not a reproduction of the hunting licence exam, which also covers equipment and species and whose format varies by prefecture,
  nor of the examination at the firearms safety course.
  Laws change, prefectures set shortened seasons and designated areas, and prefectural public safety commissions differ in how they handle
  firearm licences and cartridge acquisition, so check the current text and local rules before acting.
  Questions, choices and explanations are in Japanese only.
- **Practice Target Maker** (練習用標的の作成): from eye height, target distance and discipline, calculates the height of the target centre
  and the diameter of the aiming mark. Paper can be A4, Letter or a custom size fitted to the target. One page holds 1, 2, 4 or 6 targets,
  and the eye height, distance, centre height and diameter can be printed in the margin (in English). If they do not fit, change the number of targets or the paper.
  Print at "Actual size (100%)" and check that the test line measures 50 mm.
  The on-screen preview is not to scale. Setups can be saved by name, loaded, overwritten, renamed and deleted.
  The last deletion can be undone while the page is open. A copied share link opens the same setup on another device.
  Corner marks can be added: an 8 mm black square with a 2 mm white centre, centred 12 mm in from each corner of the sheet,
  with the centre-to-centre spacing printed at the foot (186 × 273 mm on A4). Group size measurement and target scoring use them to correct photos taken at an angle.
- **Scope Click Calculator** (照準調整のクリック数計算): from the distance, the offset of the shots and the adjustment unit,
  calculates the direction and number of clicks, and the offset left after rounding.
  Units: 1/8, 1/4, 1/2 and 1 MOA; 0.05 and 0.1 mil; or mm per 100 m.
  Distance is in m or yd, offset in mm, cm or inch. It can also give the horizontal distance from the slant distance and angle;
  holding for the drop there (the rifleman's rule) is an approximation that the ballistic calculator's slope input improves on.
  MOA is 1/60 of a degree and mil is the milliradian (not the NATO mil).
  The result is a geometric estimate. Adjust from the centre of a group of several shots.
  The Group Size Measurement tool opens it with the measured distance and mean point of impact filled in. The values travel in the link and are
  taken off the address once read, so a reload keeps later edits; the click value stays as set here.
- **Ballistic Calculator** (弾道計算とゼロイン): from muzzle velocity, bullet weight, ballistic coefficient and drag model (G1 or G7),
  sight height and zero distance, tabulates drop (cm, MOA, mil), wind drift, remaining velocity, remaining energy (J, ft-lb)
  and time of flight at each distance.
  Muzzle energy depends only on weight and velocity, so it also works for air guns. Crosswind is given as a speed and a clock direction
  (12 o'clock is a headwind, 9 o'clock from the left).
  Changing the unit of velocity, weight, sight height, wind speed, temperature, pressure or altitude converts the value so the quantity stays the same.
  Changing the distance unit keeps the number and reads it in the new unit.
  The atmosphere defaults to the standard atmosphere (15 °C, 1013.25 hPa, sea level) and can be corrected with the temperature and either
  the station pressure, the sea-level pressure and altitude, or the altitude alone. Altitude alone assumes 1013.25 hPa at sea level,
  so that day's pressure deviation is not included.
  Both the near and the far crossing of the line of sight are shown, with which one the given zero distance is.
  From an allowed radius it finds the maximum point-blank range and its zero distance in still air, and with the entered wind
  also shows where drop and drift together leave the radius. If the sight height is larger than the radius, the shot starts outside it and nothing is shown.
  The model is a flat-fire point-mass model that numerically integrates the published G1 and G7 standard drag tables.
  Spin drift, Coriolis effect and vertical wind are not included. Confirm the zero by shooting.
  Relative humidity enters the air density as dry air and water vapour at their partial pressures, with the saturation vapour pressure
  from Buck (1981, J. Appl. Meteorol. 20, 1527) with his enhancement factor for water vapour in air; the speed of sound stays at the dry-air value.
  An uphill or downhill angle tilts gravity against the line of sight; the rifle keeps the bore angle it was zeroed at on level ground,
  table distances are along the line of sight, and the point-blank range is for level ground.
  A powder temperature correction changes the muzzle velocity linearly (m/s per °C or fps per °F, entered by the user)
  from the temperature it was measured at; the zero stays as set with the measured velocity, so warm powder shows as a hit high at the zero distance.
  The turret click value (as in the Scope Click Calculator) gives drop and drift in whole clicks in the table and on the card.
  Humidity, slope, powder temperature, the click value and the sections below the card start as not entered, and settings saved
  before they were added still load unchanged. Nothing is filled in for them: without humidity the air is dry, without a slope the
  shot is level and without a powder temperature the velocity is the one entered, each stated on screen; clicks, the turret tape and
  the sections ask for their own values before they show anything.
  No drag table for diabolo air-gun pellets (such as GA) is included, because no published table with a verifiable source and licence was found;
  use the maker's G1 coefficient and true it with measured drops.
  The trajectory prints as a real-size drop card: a stock strip (100 × 45 mm), a business card (91 × 55 mm) or A7,
  with 1, 2, 4 or 6 cards on A4. The card has its own distance step and maximum distance, separate from the on-screen table,
  and drop and drift in cm, MOA, mil or clicks.
  Drift can be for the entered wind or per unit of full-value (9 o'clock) wind. Time of flight, remaining velocity and remaining energy are optional columns.
  Muzzle velocity, bullet weight, ballistic coefficient, drag model, zero distance, temperature, pressure and wind are always printed,
  so a card cannot be mistaken for one made for another load, zero or day.
  Cards are not shrunk to fit; the tool shows how many rows or cards fit instead.
  The card sheet prints only from カードを印刷する (print the cards); the browser's own print command prints this screen as it is.
  Print at "Actual size (100%)" and check that the test line measures 50 mm. The on-screen preview is not to scale.
  Gun and load names are saved in the browser like the other settings, so leave them blank on a shared device.
  Four sections below the card open on demand and work nothing out while closed:
  - Hold on the reticle: the drop and drift at a chosen distance drawn as a hold on a plain mil (0.5 mil ticks) or MOA (1 MOA ticks) scale,
    not any maker's reticle. A second-focal-plane reticle is scaled by calibrated / current magnification; a hold beyond ±10 mil or ±30 MOA
    is shown on the edge with a note to dial it instead.
  - Turret tape: from the turret circumference (measured by wrapping a strip, or diameter × π), the clicks per turn and the click value,
    marks each distance past the zero at the click it needs, labelling later turns, and prints the strip at real size on A4 with the 50 mm line.
    Tapes longer than 190 mm, or clicks closer than 0.5 mm even when thinned to every 2, 5 or 10, are reported instead of shrunk.
  - Hit probability and range: the chance of landing in the target circle at each distance, from the group (Rayleigh σ, or the extreme spread
    of one group converted with the published mean extreme spread for that shot count), the muzzle velocity SD, the error in the judged
    full-value wind and the error in the distance, each one standard deviation. The parts are independent normal spreads added in variance
    (velocity and distance vertically, wind horizontally, the group both ways), centred on the aim, and the circle probability is integrated
    numerically (Rayleigh closed form when the two SDs are equal). The furthest distance at the chance the shooter chooses (90 % by default,
    not a published standard) is searched to the table's furthest distance. Vital-zone sizes differ with the animal and the angle and no
    primary source with dimensions for Japanese game species was found, so the circle is the target radius the user enters.
  - Compare loads: up to three more loads (velocity, weight, BC and drag function) beside the form's, sharing its sight height, zero, air,
    wind and slope; drop and energy by distance and the point-blank range for each.
- **Shooting Unit Converter** (射撃の単位換算): converts one value into every unit of its quantity: pressure (bar, MPa, psi, kgf/cm², atm)
  for PCP fills, torque (N·m, kgf·cm, in-lb, ft-lb) for mounts, velocity, weight (g, kg, grain, oz, lb), energy (J, ft-lb, kgf·m),
  length, and angle (MOA, mil, degrees, cm at 100 m, inches at 100 yd). The factors follow from the exact definitions of the
  international yard and pound, the grain, standard gravity, the bar and the standard atmosphere, as listed in NIST SP 811 Appendix B.8;
  lengths on a target are converted through the tangent. Results are shown to six significant digits. Each quantity keeps its own value.
- **Wind Call Practice** (風読みの練習): two kinds of question. Wind value: the share of a wind from a clock hour that crosses the line of fire,
  the sine of its angle (3 and 9 o'clock full value, 1, 5, 7 and 11 half value). Hold: for a random distance, wind speed and hour,
  how far and to which side to hold, in mil or MOA, worked out from the drift of a 1 m/s full-value wind in the Ballistic Calculator's
  point-mass model for the user's velocity and ballistic coefficient (standard atmosphere, 100 m zero, 40 mm sight height), times the speed
  and the wind value. Answers within the chosen tolerance count; the last 200 are kept in the browser and tallied by clock hour, with the
  weakest hours named. Wind cues (flags, grass, mirage) are not taught here.
- **Trajectory Truing** (弾道の合わせ込み（トゥルーイング）): from drops measured at several distances, adjusts either the ballistic coefficient
  or the muzzle velocity until the calculated trajectory matches. Drops can be entered as a length on the target (cm, inch) or an angle (MOA, mil).
  Below the point of aim is positive, above is negative. Up to 10 rows of distance and drop can be added, and each can be removed.
  It uses the same point-mass model as the ballistic calculator, re-zeroing each candidate at the given zero distance before computing drops,
  because measured drops are taken from the line of sight of a rifle that is already zeroed.
  It minimises the root mean square of calculated minus measured drop, with a coarse scan of the range followed by golden-section search,
  so it does not fall into the nearer minimum when groups inside and beyond the zero distance are mixed.
  The results show the input and fitted values, the residuals of each (maximum and RMS), and a table of residuals by distance.
  With a measurement precision entered, it shows the range of values that explain every group to that precision, judged by the largest residual.
  Digits finer than that range are not determined by the groups.
  The fitted value can be written back to the inputs with one button, rounded to the digits shown.
  Ballistic coefficient and velocity can explain the same drops in different ways. The one not adjusted stays fixed at its entered value,
  so the result is the value under that assumption, not a measurement of the bullet. The user chooses which one to adjust.
  Fitting only short distances does not determine the value: drops differ mostly at long range, so the range of values that fit widens.
  Errors in the zero distance and the target distances also carry into the fitted value. Crosswind is not included, since it moves the bullet sideways
  and barely changes drop.
  The fitted value is only confirmed over the distances measured.
- **Velocity Spread** (初速のばらつき): enter measured velocities one per line or separated by commas to get the shot count, mean,
  standard deviation, extreme spread and the deviation as a percentage. Pasting works, and anything that cannot be read as a velocity
  is shown on screen rather than silently dropped.
  Units are m/s or fps. The values are saved as entered and are not rewritten when the unit changes,
  since they were recorded in the chronograph's unit and converting them would record values that were never measured.
  The 95 % interval of the mean uses the t distribution, and that of the standard deviation the chi-squared distribution.
  The standard deviation interval is asymmetric because of the chi-squared distribution, and small samples tend to underestimate it.
  A bias-corrected standard deviation is shown as well, using the Gaussian correction factor from Ballistipedia's "Closed Form Precision".
  The extreme spread is shown beside what a load with that standard deviation would give over the same number of shots (mean and 19-in-20 range).
  The range statistics table is from Ballistipedia's published material and goes up to 30 shots. Extreme spread grows with shot count,
  so values from different shot counts cannot be compared between loads.
  Entering a target precision for the standard deviation, in %, shows how many shots it takes to pin it down that closely.
  That number depends only on the shot count, not on the load, and precisions needing more than 200 shots are not shown.
  The vertical spread at distance is the difference when the rifle is zeroed once at the mean velocity and only the velocity changes at that bore angle.
  Re-zeroing for each velocity would make the difference zero at the zero distance, but the rifle does not know the next shot's velocity,
  so the difference remains there too. It shows the ±1 standard deviation band and the band holding 19 shots in 20 (±1.96 standard deviations).
  The trajectory uses the ballistic calculator's point-mass model with the published G1 and G7 drag tables.
  The result is the vertical difference from velocity alone. Gun and shooter movement, wind, aiming error, shot-to-shot differences in
  ballistic coefficient and chronograph error are not included, so real groups are never smaller than this.
  Velocities can be loaded from a chronograph's CSV file, read in the browser: Garmin ShotView (Xero C1) exports, recognised by the `#,` header row and
  the unit in brackets (FPS or MPS) whatever the app's language, with decimal commas; and original LabRadar `SR#### Report.csv` files (`sep=;`,
  the `V0` column, fps). The layouts were checked against real exported files on 2026-09-24, as neither maker publishes a specification.
  The file's unit replaces the reading unit rather than converting the values, and a file in a unit not seen in a real export is refused.
  Garmin FIT files are not read, as the FIT SDK licence forbids redistributing it and treats the protocol documentation as confidential.
- **Twist Rate and Stability** (ツイストと安定性の計算): from bullet diameter, length and weight, rifling twist, muzzle velocity,
  temperature and pressure, calculates the gyroscopic stability factor. Below 1.0 the bullet is unstable; published recommendations are
  1.3 (benchrest), 1.5 (most uses), 2.0 (margin for cold weather), and 1.5 to 2.5 for the military.
  With a target stability factor, it also gives the twist needed and the longest bullet of the same weight the twist will stabilise.
  Bullet material is not entered: density is already in the weight, so the same formula covers lead-core jacketed and monolithic copper bullets.
  Lead-free bullets are longer for the same weight, and length is what the formula responds to most, so changing bullets alone can make them unstable.
  The formula is Don Miller's empirical formula (Precision Shooting, March 2005 and June 2009),
  not measured data like the G1 and G7 drag tables used for trajectories.
  Its reference is Army Standard Metro (59 °F, 750 mmHg) at 2800 fps; at the standard atmosphere the atmospheric correction is about 0.987.
  Below the speed of sound (1120 fps) the velocity correction is held at its value at the speed of sound, which applies to all air guns.
  Bullets with polymer tips fall outside the formula's assumptions. It covers gyroscopic stability only, not whether the bullet
  settles in flight (dynamic stability). Confirm stability by checking that the holes in the target are round.
- **Reticle Ranging** (レティクルの測距): enter two of the object's real size, its size in the reticle and the distance to get the third.
  Real size is in cm, inch or m, reticle size in mil or MOA, and distance in m or yd; results are shown in both units.
  FFP or SFP can be chosen; for SFP the reading is corrected from the magnification the reticle is true at and the one actually used.
  It shows how far the estimated distance moves if the reading is off by 0.1, and the range if the real size is off by 10 %.
  It assumes the object is centred in the view and read from edge to edge. Because the angle spans both sides of the optical axis,
  the formula is distance = size ÷ (2 × tan(angle ÷ 2)), not an approximation such as "1 mil is 10 cm at 100 m".
  MOA is 1/60 of a degree and mil is the milliradian (not the NATO mil).
  Ranging is an estimate. Real sizes vary between animals and the apparent size changes with posture and angle, so confirm with a rangefinder or by shooting.
- **Group Size Measurement** (着弾群の測定): photograph the target with the camera or load an existing photo,
  set the scale from two points and their real distance, and place the point of aim.
  Enter the bullet diameter and press 写真から自動で検出 (detect from photo) to find round marks of that size and turn them into hits.
  It picks up marks darker than their surroundings and marks that show light inside a black aiming mark. The sensitivity has steps,
  and overlapping holes count as one, so always compare with the target and add or remove hits by hand.
  Hits are recorded by clicking the image or entering the distance from the point of aim. It totals the number of hits,
  the extreme spread (centre to centre), the vertical and horizontal offset of the mean point of impact, the mean radius,
  and the horizontal and vertical standard deviations.
  With a bullet diameter, the outside size (centre to centre plus one diameter) is shown too. Group size and offset are converted to MOA and mil from the distance.
  The offset of the mean point of impact is shown in the form the scope click calculator takes. The values are entered there by hand.
  Extreme spread depends only on the two widest shots, so compare several groups of five or more.
  The statistics give a 95 % confidence interval for the mean point of impact on each axis and say whether the offset could be chance.
  On an axis whose interval spans zero, this group alone cannot tell which way to adjust.
  Entering a target precision in mm, cm, inch, MOA or mil shows how many shots it takes to find the mean point of impact that closely, and how many more are needed.
  The per-shot dispersion (σ) and the mean radius over many shots are shown with confidence intervals, along with the expected range of the extreme
  spread for the same number of shots next time and the averages for 3, 5 and 10-shot groups. When horizontal and vertical dispersion differ widely,
  a warning is shown on σ, the mean radius and the expected extreme spread, which assume a circular spread. The per-axis judgement
  and the shots needed do not use that assumption and are not affected.
  The statistics assume the shooting and conditions stayed the same throughout, so shooter fatigue, barrel heat or changing wind make
  the intervals and the shots needed come out narrower than they really are. The σ estimate and the extreme spread by shot count are from Ballistipedia's published material.
  The scale can instead come from the four corner marks of a sheet printed by the practice target maker: with the marks placed and their printed
  spacing entered, the photo is mapped onto the sheet by a plane projective transform (homography) from the four points, so a photo taken at an
  angle is read in true millimetres. Lens distortion is not corrected, and the marks only give true lengths if the sheet was printed at 100 %.
  Several groups on one photo, such as a ladder test, each get their own aim point; the groups are compared side by side,
  and detection puts each hole in the group with the nearest aim point. Saving and the statistics use the group being edited.
  With two or more saved groups, the extreme spread and mean radius of each are drawn over time in MOA.
  The camera feed, the photo and the image analysis stay in the browser; nothing is sent or saved.
  Only the hit coordinates, settings and notes are saved, and records can be exported as CSV.
- **Target Scoring** (標的の採点): scores shots on the 10m Air Rifle, 10m Air Pistol, 50m Rifle and 25m precision / 50m Pistol targets
  (the last for the 5.6 mm events or the 25m Centre Fire precision stage),
  either by tapping where each hole is on the drawn target or from a photo. A photo is lined up by the target centre and the edge of the black,
  or by the corner marks of a sheet from the practice target maker, which also corrects a photo taken at an angle; holes are then detected
  with the same detection as group size measurement and can be added or removed by hand.
  Scores are decimal (to 10.9) or whole rings, with inner tens, sighters kept apart, series of ten, total, average per shot and the mean point of impact.
  Cards can be saved by name, and the average per shot of saved cards is drawn over time.
  Ring sizes are the outside diameters in the ISSF Rule Book 2026 (Edition 2025, second print 07/2026; rules 6.3.4.2, 6.3.4.3, 6.3.4.5, 6.3.4.6),
  checked 2026-09-24. A hole of the event's calibre (4.5 or 5.6 mm, and 9.65 mm for 25m Centre Fire whatever its calibre, as the
  scoring gauges are: ISSF Rules for Paper Target Scoring 1.4.1 and 1.4.3, checked 2026-09-25) touching the outer edge of a higher ring
  scores the higher value (Paper Target Scoring 5.2.1), and decimal rings divide each ring's scoring area into ten (Rule Book 6.3.3.1).
  Series are of ten shots, as ties are broken on them (Rule Book 6.15.1 b); in the 25m events, fired in series of five, two make one.
  The rules do not give the formula electronic targets use, so this is a practice score, not a gauge decision or an electronic target's score.
  The 25m / 50m pistol target is scored in whole rings, since its 10 ring is wider than the others. The photo is neither sent nor saved.
- **Shot Timer** (ショットタイマー): after a fixed or random delay a start beep sounds, and an optional second beep at the par time.
  With the microphone on, each block of sound (128 samples, read by an AudioWorklet on the audio clock the beep was scheduled on) whose peak
  reaches a threshold in dBFS counts as a shot, then nothing is counted for a set gap so the echo is not a second shot.
  The timer's own beeps are ignored. It shows the time of each shot from the beep, the splits, the first and last shot and whether the last was within par,
  with a live level meter for setting the threshold. Detection goes by loudness alone, so the next bay, echoes or a dropped magazine can count
  and quiet shots can be missed; speaker and microphone latency is not corrected. The microphone can be turned off to use it as a par timer.
  The screen is kept on with the Screen Wake Lock API where the browser allows it, and the page says when it cannot.
  A video or recording of a run can be loaded instead: its sound is decoded in the browser and the same detector, in 1 ms blocks, lists each loud moment.
  The reader picks the start signal and unticks what was not a shot, and the shot times and splits follow. The file is neither sent nor saved.
  Only the settings are saved; strings timed on the page are lost when it is closed.
- **Match Command Timer** (競技の号令タイマー): plays the commands and times of ISSF 10m Air Rifle / Air Pistol qualification (60 shots in 75 min),
  50m Prone qualification (50 min), 50m 3 Positions qualification (90 min indoors, 105 min outdoors), the 10m Air Rifle / Air Pistol final
  and the 50m 3 Positions final, with the time left in each phase, the last and next command and the full list of commands.
  Each command beeps and is read by the device's speech synthesis in English as the Rule Book writes it, or in this tool's Japanese rendering.
  It can be paused, resumed and skipped to the next command, and the screen is kept on with the Screen Wake Lock API where the browser allows it.
  Times and wordings are from the ISSF Rule Book 2026 (Edition 2025, second print 07/2026; rules 6.11.1, 6.11.9, 7.7.4, 8.11, 6.17.2, 6.17.3),
  checked 2026-09-24; qualification times are those for electronic targets. The rules give the 10 and 5 minute announcements in qualification
  a time but no wording, so the wording is this tool's and is marked. Finals timings are guidelines in the rules, which point to a separate ISSF
  document, "Commands and Announcements for Finals", that has not been checked; the pause from a STOP to the next LOAD is the reader's setting (20 s by default).
  In a real final STOP comes as soon as everyone has fired, and eliminations and tie-breaks are announced. It is a practice clock.
- **PCP Fill Calculator** (PCP 空気銃の充填回数): from the cylinder's water capacity and pressure, the gun's reservoir volume, the pressure it is filled to
  and the pressure it is down to, and the hose volume bled after each fill, counts the full fills, the partial last fill and the pressure left
  in the cylinder, with the pressures after each fill. Pressures are gauge readings in bar, MPa or psi (1 psi = 6894.757 Pa); changing the unit converts them.
  With the shots per fill it also gives the total shots. Air is treated as an ideal gas at constant temperature (Boyle's law) with 1.01325 bar added
  for absolute pressure. At 200 to 300 bar real air is less compressible than an ideal gas, so real cylinders give fewer fills than calculated,
  and filling warms the air so gauges read high until it cools. It never suggests exceeding a gun's or cylinder's rated pressure.
- **Shotgun Pattern Measurement** (散弾パターンの測定): photograph the pattern board with the camera or load an existing photo,
  set the scale from two points and their real distance, and overlay a 76.2 cm (30-inch) circle.
  Enter the pellet diameter and press 写真から自動で検出 (detect from photo) to find round marks around the circle that are darker than the paper and the size of a pellet,
  and turn them into hits. The sensitivity has steps, and overlapping marks count as one, so always compare with the board.
  Hits are recorded by clicking the image or entering the distance from the centre in cm. It totals the hits inside the circle,
  the offset of the centroid, the ratio inside and outside an inner circle of half the area, and the spread up, down, left and right.
  With the total pellet count of the load, it gives the pattern percentage.
  The camera feed, the photo and the image analysis stay in the browser; nothing is sent or saved.
  Only the hit coordinates, settings and notes are saved, and records can be exported as CSV.
  A density map counts the hits in square cells of 2.5, 5 or 10 cm, and a gap check samples the circle every 1 cm for places where a disc of a
  chosen diameter (the size of the target of interest) would hold no hit, giving the share of such places and the largest empty circle.
  Each measurement can carry its setup (typed, or filled from Shotgun Gear with an estimated pellet count) and its distance.
  Up to four saved measurements can be compared side by side with their maps, and a choke plan averages the user's own pattern percentages
  by setup for each planned distance (records within 2.5 m), leaving distances without a record empty. No general choke tables are included,
  as no source for them could be confirmed.
- **Shot Pellet Count and Energy** (散弾の粒数とエネルギー): from pellet diameter, material density, load weight and muzzle velocity,
  calculates the weight of one pellet and the number in the load, and at each distance the remaining velocity, remaining energy (J, ft-lb),
  time of flight and drop from gravity.
  Two conditions are shown side by side, with the percentage change in pellet count, pellet weight and energy at a given distance.
  Diameter can be in mm or inch, load in g or oz, velocity in m/s or fps, and distance in m or yd.
  Choosing a shot size fills in its average diameter, using SAAMI "SHOT SIZE": diameter (hundredths of an inch) = 17 − shot size.
  No source was found confirming that shot sizes on shells sold in Japan follow the same system, so check the actual size on the box or by measuring.
  Material densities default to the Royal Society of Chemistry periodic table values of lead 11.3, bismuth 9.79 and iron 7.87 g/cm³, and can be overwritten.
  Hardened lead and tungsten alloys differ in density from the pure metals. TSS is offered at 18 g/cm³, the figure Federal publishes for its
  HEAVYWEIGHT TSS (checked 2026-09-24), which applies to that product only. A cartridge from Shotgun Gear can fill either condition.
  The non-lead equivalent flies condition A and a steel, bismuth or TSS pellet at a chosen muzzle velocity with the same model and finds,
  by bisection, the diameter that carries the same energy at the comparison distance, with the nearest shot number (within half a size)
  and the pellets in the same weight of charge. It is not a rule-of-thumb table, and the same energy is not the same effect.
  Pellets are treated as spheres subject only to drag and gravity, integrated numerically with a sphere drag table from the US Army Ballistic Research Laboratory.
  That table was measured on 9/16-inch spheres, so applying it to pellets a few millimetres across is an approximation.
  Pellet deformation at firing, interaction between pellets, shot string length, choke and wad are not included.
  The result is the velocity and energy of one pellet, not a judgement of effectiveness on game.
  How many pellets hit depends on the pattern, so measure the pattern of the actual gun and load with the shotgun pattern tool.
- **Lead Calculator** (リード（見越し）の計算): from target speed, distance, crossing angle and shot velocity,
  calculates the time of flight and the lead needed ahead of a moving target.
  Lead is shown in m and cm or inch and ft, and the swing angle of the muzzle in degrees, MOA and mil, with a table comparing distances and crossing angles.
  Speed is in km/h, m/s or mph, distance in m or yd, and shot velocity in m/s or fps.
  The target can be above the gun (elevation) and climbing or dropping (climb); the lead is then split into a sideways and an up-or-down part.
  By default the shot velocity is the muzzle velocity and one pellet of the given diameter and density is flown with the shot pellet calculator's
  sphere drag table and gravity in the sea-level standard atmosphere, so it slows and falls; the aiming point includes the drop.
  The pellet is flown along the line the muzzle points on, so up or down a slope the part of gravity along that line slows or speeds it as well.
  A cartridge from Shotgun Gear can fill the pellet and velocity. Alternatively an average velocity over the distance can be entered, and the shot
  then flies straight at that speed without drop, as in earlier versions; settings saved before the drag model open with it.
  It solves for the shot and the target reaching the same point at the same time, so the time of flight is shorter for incoming
  targets and longer for outgoing ones. A crossing angle of 0° is a target coming straight at the shooter, 90° is crossing, and 180° is going straight away.
  The delay from trigger to firing and the shooter's reaction are added to the time of flight only when entered.
  A shooter's-eye view and a view from above show the target, the aiming point and the meeting point.
  It does not include target slowdown, a change of course, wind or shot string length. If the shot cannot catch the target, it says so.
  The result is the geometric lead, not an instruction on technique such as maintained lead or swing-through.
  No muzzle velocities or standard distances for each discipline are built in, as no source could be confirmed. Enter the values for the load you use.
- **Recoil Calculator** (反動の計算): from gun weight, projectile weight, wad, powder charge, muzzle velocity and gun type,
  calculates recoil momentum, free recoil velocity and free recoil energy. Two conditions are shown side by side with the percentage change in velocity and energy.
  One condition can be copied to the other to compare a single change. Weight is in kg or lb, the load in g or grain,
  and velocity in m/s or fps; changing the unit converts the value so the weight or speed stays the same.
  The effective velocity of the powder gases is a multiple of the muzzle velocity, using the factors from SAAMI "Gun Recoil - Technical: Free Recoil Energy"
  (Rev. 7/9/2018). The mass of the gases is taken to equal the powder charge.
  Free recoil is the value when the gun recoils freely; how it feels changes with hold, stock, action and recoil pad.
  No measure of felt recoil is calculated. Muzzle brakes and suppressors fall outside the formula's assumptions.
- **Maximum Range** (最大到達距離の計算): from a bullet (ballistic coefficient, drag model, bullet weight) or a sphere (diameter, material density),
  with muzzle velocity, elevation and muzzle height, calculates the range, time of flight, maximum height, and velocity and energy on landing.
  It sweeps the elevation to find the maximum range and the elevation that gives it, with a table by elevation.
  The entered temperature and pressure are taken as ground values and change with height at the standard lapse rate.
  For lead spheres an estimate from Journée's rule of thumb is shown alongside (not used in the calculation).
  The model is a point-mass model with zero yaw. At high elevations real bullets lose their attitude and drag rises,
  so real ranges tend to be shorter than calculated. Ricochets, wind, terrain and humidity are not included.
  The result is how far a projectile can reach, not a distance beyond which it is safe.
  It does not replace checking what is beyond the target, a backstop and control of the line of fire.
- **Legal Shooting Hours** (銃猟可能時間): from a prefecture preset, entered latitude and longitude, or the current location, and a date,
  shows sunrise and sunset, the hours gun hunting is allowed, and the time left until sunset. Places can be saved by name.
  Article 38(1) of the Wildlife Protection and Management Act prohibits gun hunting before sunrise and after sunset.
  Sunrise and sunset are the sun's upper limb on the horizon with 35′8″ of refraction, as NAOJ defines them.
  The times are astronomical estimates; actual light varies with terrain, weather and altitude.
  There are exceptions such as night shooting permits, so check the prefecture's rules and the conditions of any permit.
  For reference it also shows moonrise, moonset (the Moon's centre on the horizon with 35′8″ of refraction, as NAOJ defines them),
  the age at noon and the lit fraction. The Moon's position uses the Astronomical Almanac's low-precision formulae (1900–2100),
  so the times can differ from NAOJ's tables by a few minutes.
- **Outing Plan Card** (入山計画と帰着予定): collects where the hunter is going, with whom, the route, departure and the time due
  back, vehicle, radio, gear and an emergency contact into a card that prints on its own, copies as text, or downloads as an
  iCalendar file (RFC 5545) with one event from departure to the time due back and an alarm at the time due back, so the calendar
  it is imported into gives the alert. No law prescribes the items, and the page never contacts anyone itself. Because it holds
  names and a phone number, it is saved only when この端末に保存する (save on this device) is ticked.
- **Trail Camera Activity** (トレイルカメラの出没時刻): reads the time each JPEG was taken from its Exif data (DateTimeOriginal,
  else DateTimeDigitized or DateTime, with OffsetTime when written; CIPA DC-008), from photos chosen together or from a ZIP
  (stored or deflated entries, inflated with the browser's DecompressionStream), and counts them by hour, by date and hour,
  by hours from sunrise and sunset at a given place, and by moon age in eight parts. The camera clock's time zone (Japan by
  default) and a correction for a fast or slow clock can be set. Each photo counts once. What a photo shows can be chosen per
  photo, and the counts narrowed to one kind. On request, SpeciesNet (Google, Apache License 2.0; the whole-image version
  4.0.3b, converted to ONNX with float16 weights and published as
  [sasakiuri/speciesnet-v4.0.3b-onnx](https://huggingface.co/sasakiuri/speciesnet-v4.0.3b-onnx)) runs in a Web Worker with
  ONNX Runtime Web and marks the photos not marked by hand; answers below 50 % are shown but not used. The model (112.6 MB)
  is fetched from Hugging Face at a pinned revision after the reader presses the button that states its size, checked
  against its SHA-256 and kept in Cache Storage. SpeciesNet has no Japanese macaque label (it answers macaque) and names
  serow, badger, hare and marten only to the genus (checked 2026-09-25). The page scales photos with the canvas, which is
  close to but not the same as the original bilinear resize, so scores can differ slightly between browsers. For the time,
  the first 256 KB of each JPEG is read, and a photo in a ZIP is unpacked whole; the model reads each photo again, on the
  device. Nothing is saved or sent except the settings.
- **Drive Hunt Plan** (巻き狩りの配置図): places the stands on the map (by tapping or at the device position), gives each stand
  up to four directions not to shoot into (bearings clockwise from true north, drawn as wedges whose length is for legibility only),
  keeps a roster with roles, and draws lots for the stands among the people on stands with the browser's cryptographic random
  numbers. The plan prints on its own: a to-scale sketch of the stands with north and a scale bar (no map picture), the stand list
  and the roster with a signature column. No law prescribes such a plan, and nothing is shared live on the day.
- **Shooting Danger Area** (射撃の危険範囲): from a firing point (the device position or a tap on the map), a bearing
  (typed or picked on the map) and a row of the tables of the US Army range safety pamphlet DA PAM 385-63 (16 April 2014),
  draws that pamphlet's cone surface danger zone, figure 4-1: a dispersion area 5° either side of the line of fire, ricochet
  areas the next 5° and Area A opening at 30°, with Distance X and the width of Area A taken from the same row (earth or water
  impact): 12-gauge slug, buckshot and shot larger than 7½ 1,073 m and 100 m (table 4-1), .22 LR 1,400 m and 100 m (table 4-3).
  No other range is fitted to the figure. 12-gauge 7½, 8 and 9 shot is not drawn, since the pamphlet uses its trap range
  shotfall figure 4-8 for it; the 2° dispersion of paragraph 4-1 d (range training under an approved risk assessment) and the
  batwing of figure 4-3 are not drawn either. It is a military range design standard, not Japanese law, and not a line beyond
  which a shot is safe; terrain, hard ground, water and wind are not included, and no Japanese public figure for ricochet was found.
- **Coordinate Converter** (座標の変換): converts one point between decimal degrees, degrees–minutes–seconds, UTM, MGRS,
  the 19 plane rectangular coordinate systems (MLIT Notice No. 9 of 2002, scale 0.9999) and the standard grid square codes
  (Administrative Management Agency Notice No. 143 of 1973: first to eighth level, and the fivefold and twofold squares).
  A point can also come from the device position or a tap on the map. The projections use the Gauss–Krüger series GSI publishes
  (Kawase 2011) on JGD2011; the old Tokyo datum is not handled. The mesh number in the hunting results report is the one on the
  prefecture's map, which need not be the standard grid. An MGRS reference or a grid square code is read as the centre of the
  square it names (MGRS from 1 m to 100 km precision).
- **Trap and Net Tags** (わな・網の標識): makes the tag the law requires on each trap or net. The items switch between hunting
  (Article 62(3) of the Act, Article 70 of the Enforcement Regulations) and capture under permit (Article 9(12) of the Act, Article 7 of the Enforcement Regulations).
  The character box is 10, 12 or 15 mm, and 1, 2, 4 or 6 tags print at real size on A4.
  Print at "Actual size (100%)" and check that the test line measures 50 mm.
  The law requires the details on a metal or plastic tag in characters of at least 1.0 cm.
  What is chosen here is the size of the character box; the visible glyphs are smaller than the box by an amount that depends on the typeface.
  To make the glyphs themselves at least 1.0 cm, 12 mm or larger leaves a margin.
  A paper printout does not meet the material requirement: use it to check the content and the character size,
  and write the tag itself on metal or plastic.
  Because it contains an address and name, the input is not saved by default.
  It is saved only when この端末に保存する (save on this device) is chosen, and turning that off deletes what was saved.
  A combined tag carries the items of both hunting and the permit (the shared address and name once); the law only requires the items
  on each trap and no rule allowing or forbidding a combined tag was found, so the page asks the reader to check with the prefecture.
  A permit or combined tag can be printed on two sides with the species on the back; the back sheet swaps its columns so each tag
  backs onto itself when flipped on the long edge. Any item can be left blank to write by hand, printed as a row of empty
  character boxes at the chosen size, and is then not required. Several people's tags can be made from a CSV (Japanese headers,
  a template per purpose, up to 50 rows, one sheet each, checked row by row and not saved). Besides the browser's print, the
  sheets download as a real-size PDF: each is drawn at 300 dpi with the browser's fonts and placed as a JPEG over an A4 page, so no
  font is embedded and the print dialog cannot rescale it.
- **Trap Warning Sign** (わな設置中の注意看板): prints a "traps set" sign on A4 or A3 portrait: 危険, the headline (traps, snares or box
  traps) and "keep away from the traps", with optional English lines and optional target species, period, setter and contact.
  Nothing is saved, as the sign can carry a name and a number. No nationwide duty or format for such a sign was found; Wakayama
  Prefecture makes one a condition for snares over 12 cm without setting its wording, which the page quotes. It does not replace
  the tag each trap must carry.
- **Scope Click Verification** (スコープのクリック値検証): from the amount dialled and the amount moved on a tall target, calculates the correction factor
  (expected ÷ measured), the tracking ratio, the effective click value (nominal × measured ÷ expected), the error, and the cant implied by sideways movement.
  The definitions follow the Applied Ballistics Tall Target Test Worksheet. The correction factor and the effective click value are applied in opposite
  directions, so both are shown.
  A target of the required height prints across A4 sheets, with a 50 mm check scale on each page.
- **Load Development** (ロード開発（ラダーテスト）の解析): from the velocities and impacts at each step of a series such as powder charges,
  shows each step's mean and standard deviation and the difference between adjacent steps with a 95 % interval.
  Scatter within a step uses the pooled standard deviation, and the two axes (horizontal and height) use Bonferroni intervals.
  There is no official threshold for a change small enough to ignore, so the user enters it; the tool does not pick a best step.
  It quotes the Explosives Control Act and its Enforcement Regulations on making cartridges but does not judge whether anything is lawful.
- **Clay Shooting Score Sheet** (クレー射撃のスコアシート): records the 25 targets of a trap or skeet round and totals the score,
  the hit rate at each station and the longest run.
  Trap hits can be recorded with the barrel that broke them (first or second), which gives the first-barrel rate, and optionally the direction
  the target flew (left, centre, right), which gives the hit rate and misses by direction. Skeet is tallied by high and low house, singles and doubles.
  Up to six shooters can be scored on one device in the ISSF shooting order: trap passes target by target, skeet finishes each station per shooter.
  Each round carries tags for the gun, cartridge, range and weather (typed in, or filled from Shotgun Gear), and rounds saved together form a session.
  The history filters by shooter and tags and draws the score of each round over time.
  Results can be entered with keys the user assigns; a Bluetooth remote that acts as a keyboard works if its key reaches the page, which the
  assignment screen shows. Volume keys often do not.
  The station layout, directions per station, squad size and order follow the ISSF Rule Book 2026 Edition (rules 6.4.18-19, 9.6.1.3, 9.8.1, 9.9.1.1, 9.9.2.2, 9.10.2.1).
  The Japan Clay Target Shooting Association rule book is sold rather than published, so domestic disciplines are not offered.
  The barrels, directions, shooter, tags and session are optional in a saved round: rounds saved before they existed read as they are,
  and count as without barrels, directions or tags, each outside any session.
  Blank sheets can be printed. It is for practice records and does not replace an official referee's record.
- **Shotgun Gear** (散弾銃の装備の登録): registers guns and their barrels, chokes and cartridges (pellet diameter, material density, shot charge,
  muzzle velocity), and combinations of barrel, choke and cartridge. The score sheet, pattern measurement, pellet calculator and lead calculator offer them as a
  choice that copies the values into their own fields, so later changes to the registry do not rewrite saved records.
  The TSS density of 18 g/cm³ is Federal's published figure for HEAVYWEIGHT TSS (checked 2026-09-24) and applies to that product only.
- **Gun Fit and Eye Dominance** (ガンフィットと利き目): records a stock's length of pull, drop at comb, drop at heel and cast (with its side,
  seen from behind the gun) in mm or inches, saves sheets by gun name and prints an A4 dimension sheet with a diagram of where each is measured.
  The definitions follow Orvis's "Shotgun Stock & Measurements" and Browning's fit FAQ (checked 2026-09-24); pitch and lengths to heel and toe
  have no field of their own, as no primary source defining them was confirmed, and go in the note. It does not judge which dimensions fit.
  The eye test follows the sighting method in Lopes-Ferreira et al. (BioMed Research International, 2013): a distant letter through an opening
  between the outstretched hands, one eye closed at a time. It tallies the trials and names an eye only when it was seen in more than half of them.
  It is not a medical diagnosis, and the paper found it agreed with another method in 72.7 % of cases.
- **Hunting Area Map** (狩猟マップ): place reference points (a point on the image and its latitude and longitude) on an image (PNG or JPEG)
  of a protected-area map you already have, and fit a similarity or affine transform by least squares in either transverse Mercator
  (GSI plane rectangular coordinates) or Web Mercator.
  The device's position is overlaid on the map, with the residual of each reference point. The image and points are stored in IndexedDB;
  the position is neither saved nor sent.
  A PDF can be loaded as it is: the chosen page is drawn in the browser with PDF.js at 3,000, 5,000 or 7,000 px on the longer side
  (within 16 million pixels) and kept as a PNG. Several maps can be kept, named and switched between; each has its own points,
  areas and fiscal year (April to March, as the prefectures date them), and a map whose fiscal year has ended carries a warning.
  Areas such as protected areas can be traced on the picture; with the position shown, the tool says whether it is inside each area
  and how far the edge is, and says it cannot tell when the edge is closer than the position's uncertainty.
  The aligned picture can be laid over the GSI map with a chosen opacity (drawn piecewise through the fit, so a transverse Mercator
  fit lands correctly on the Web Mercator tiles), and a reference point's coordinates can be picked on the GSI map.
  The map can be exported as a KMZ (JPEG pieces, whole or split 2 × 2 to 4 × 4, corners written as gx:LatLonQuad, traced areas as
  polygons) and the areas alone as KML. Maps saved by the earlier single-map version are carried over when the page opens.
  The correctness of the areas is not guaranteed.
- **Hunting Log** (出猟・捕獲の記録): records the place, method and game taken on each day out, and totals and prints a draft of the hunting results report
  (Article 66 of the Act, Article 65(13) of the Enforcement Regulations) in the columns of the report section on the back of the hunter registration certificate (Form 17).
  The report is due on the 30th day after the registration expires, counting the first day after its last day as day 1: 15 May for a registration
  ending on 15 April, the date Ehime Prefecture gives in its guidance on returning the certificate (https://www.pref.ehime.jp/page/111683.html, checked 2026-09-25).
  Prefectures may use different forms, and the user submits the report. The report table is in Japanese only.
- **Snare Gauge** (くくりわなの規格ゲージ): shows the standards in Article 10(3)(ix) and (x) of the Enforcement Regulations and the relaxations of the loop
  diameter that the 47 prefectures have set for hunting, by species, area, period and condition. The relaxations are based on each prefecture's guidance
  and its Class II Specified Wildlife Management Plan; the text of the public notices has not been checked.
  A warning is shown once the period of the plan relied on has passed. It does not judge whether a place falls within an area.
  A diagram of where to measure the inside diameter (the inside diameter perpendicular to the longest inside line), real-size gauges of 12, 15 and 20 cm,
  and a 100 mm check line print on A4.
- **Trap Check Log** (わな見回りの記録): registers each trap with when and where it was set, and records the time and result of each check.
  It flags a trap when the time since its last check passes an interval the user chooses. The law sets no single interval; the relevant passages of the
  Ministry of the Environment's basic guidelines and prefectural guidance are cited.
  Records can be exported as CSV and printed.
  The device's position can fill in a trap's coordinates or be recorded with a round, read once when the button is pressed, with its accuracy.
  A catch or non-target catch records the head count and, optionally, the species; a round can carry a photo, shrunk to 1600 px
  and kept in IndexedDB on the device (drawing it on a canvas drops the file's metadata). The next round of every set trap exports
  as an iCalendar (.ics) file with an alarm at the time the interval runs out; the page itself does not notify, and the file does not
  move when rounds are recorded. Work time is recorded by start and end (or entered afterwards) and totalled into a daily report
  for a month, counted on the day the work started, with CSV and print. Report forms differ between municipalities, so the report
  is a draft. Each trap shows its trap-days, rounds, catch per 100 trap-days (CPUE, one trap standing one day as the unit of effort)
  and the non-target share; rounds saved without a head count are left out and counted separately.
- **Electric Fence Planner** (電気柵の設計計算): choose wire heights from presets taken from the Ministry of Agriculture's manual and material from
  Tottori, Fukui and Kyoto prefectures, and calculate the wire, posts, insulators and gate handles from the perimeter, gates, uneven sections and a spare margin.
  The requirements of Article 74 of the Ministerial Ordinance on Technical Standards for Electrical Equipment and Article 192 of its interpretation,
  and sourced inspection points, are always shown.
  It does not judge whether an installation meets the standards.
  A further section covers the energiser, solar, fittings and cost. Japanese makers rate energisers by maximum wire length, not
  joules, and the national manual says the capacity follows from the length, so it gives the powered wire length a model has to
  be rated for; for a bear fence it also shows Kyoto Prefecture's guide (1 J for a perimeter of 300–450 m, 1.5 J for 450–600 m,
  2 J for 600–900 m), which notes that joules cannot be compared between makers. The solar panel and battery follow Kencove's
  method (a US supplier, stated as such): daily Wh = power draw × hours, panel = daily Wh ÷ peak sun hours × 1.2, battery = daily
  Ah × days without sun ÷ usable share (50 % by default). The power draw, peak sun hours (NEDO's database is pointed to) and days
  are entered by the user. Danger signs are counted at a spacing the user enters, as the rules say only "at suitable intervals";
  earth rods follow the energiser's manual. An earth-leakage breaker is shown as required for a fence fed from 30 V or more where
  people can easily go (article 192(iv) of the interpretation). The cost multiplies the quantities by unit prices the user
  enters, with an optional subsidy share. These inputs are saved under their own key (`nilay-labs-electric-fence-power-v1`).
- **Tracking Wounded Game** (半矢の追跡): from signs such as blood colour and froth, shows with sources how to read where the animal was hit
  and a guide to how long to wait before trailing.
  No wait times were found in Japanese public material, so figures from North American state agencies and course material are given for reference,
  with the regional difference stated.
  It quotes Japanese material on the ban on leaving game (Article 18 of the Act, Article 19 of the Enforcement Regulations) and on safety when dispatching,
  and records the places and times along the trail. Entries logged with a position are shown on the map in time order, with
  the straight-line distance and true bearing of the last one from the shot site.
  The blood-finding camera takes a photo with the phone's camera (through the file picker) and, on the device, paints reddish
  pixels in cyan or yellow and greys the rest, with a sensitivity setting. It picks out colour, not blood, and the photo is
  neither saved nor sent.
- **Game Meat Capture Record** (ジビエの捕獲時記録票): creates the capture record for each animal following the items of the Ministry of Health, Labour and
  Welfare's guidelines on the hygiene of wild game meat and Form 2 of its handbook, and prints it on A4. If any of the 11 abnormality checks applies,
  the wording of the guidelines is shown.
  It shows the time since bleeding began and the handbook's body temperature guide. The processing facility decides whether to accept the animal. Japanese only.
  An individual number (such as a tag number agreed with the facility) is printed with a QR code of it, drawn in the browser
  (byte mode, error correction level M). The device's position can be recorded (latitude within ±90°, longitude within ±180°) and printed beside the place; the link to the
  GSI map sends the coordinates to that site. Up to four photos per animal are redrawn at up to 1,600 px as JPEG, which drops
  the file's metadata including any position, kept in the browser's IndexedDB and printed on a page after the form.
  All records can be downloaded as CSV (UTF-8 with BOM, one animal per row in the sheet's order, text that would read as a
  spreadsheet formula prefixed with an apostrophe). A guide to abnormal findings lists, stage by stage and for deer or wild boar,
  what the MHLW colour atlas to the guideline (last revised 19 March 2025, checked 2026-09-24) shows and what it says to discard,
  with the page. These fields are optional: records saved before they were added still open, with them shown as not entered.
- **Print and Dropping Gauges** (足跡・糞の実寸ゲージ): prints real-size gauges of the print and dropping sizes public sources give:
  the Ministry of Agriculture's mesocarnivore manual (raccoon, masked palm civet, raccoon dog, badger), Yamaguchi Prefecture's
  measurements of 144 Asian black bears (means), Toyota City and Ishikawa Prefecture's Hakusan centre (bear, raccoon dog and deer
  droppings) and, marked as university material, the University of Tsukuba's tracking booklet (fox, hare, boar). Prints are boxes
  of length by width, a length alone is a dashed bar, and droppings are circles of their width; the source's words are shown for
  each. No source gave a sika deer print or any macaque size, so none is drawn, and the badger's figures differ between the
  ministry's manuals, which the page notes. The chosen gauges flow over A4 pages with a 100 mm check line on each.
- **Village Attractant Check** (集落点検・誘引物チェック): inspects a village for what draws animals in. The items are 5-16 to 5-18
  of the village inspection form of the Ministry of Internal Affairs (the bear items added on 3 July 2026), table 1 of the Ministry
  of Agriculture's wildlife damage checklist (cover on riverbanks, abandoned fields, unpicked persimmons, crop residue, bamboo shoots,
  rice regrowth, unstaffed stalls, rubbish points, pet food, kitchen gardens, grave offerings) and the attractants in the Ministry
  of the Environment's bear manual (hives, compost, things stored outdoors), each quoting its source. Each item is found, none or
  not checked, with a note. Inspections are saved by date on the device and compared with the one before (new, resolved, still
  there); saving clears the form for the next one. The sheet prints blank for use on site, or filled in.
- **Deer Density Estimate** (シカの生息密度の推定): deer per km² by three published methods. The random encounter model uses
  eqn 4 of Rowcliffe et al. (2008), D = (y/t)·π/(v·r·(2+θ))·g, from independent passes per camera-day, day range, detection radius
  and angle, and mean group size; the defaults of 7.4 km/day, 18.1 m and 57° come from a Gunma Prefecture sika deer study.
  The pellet method with a measured loss uses the Taylor and Williams formula as written in Nagano Prefecture's management plan,
  with its pellets per deer per day (1,385 in January to March, 1,521 in October to December, Horino and Nomiya 2008).
  FUNRYU follows eqs (2), (5) and (9) of Iwamoto et al. (2000): monthly loss from temperature and pellet age, traced back 100 months,
  with the monthly pellet counts of its appendix, and reproduces that appendix's worked example. The authors limit FUNRYU to forests on
  the Kyushu mainland for now, which the page states; a month below about −4.1 °C gives a negative loss and is refused.
- **Capture Photos and Payments** (捕獲確認の写真と報償金): a checklist of what the Ministry of Agriculture's capture confirmation
  manual (revised 1 April 2025) asks the photos to show when a capture is confirmed from documents: the oil-based marking, the
  animal with its feet down and head to the right, the hunter, the animal, the date and the marking in one photo, the permit or
  certificate when captured alone, at least one of the extra anti-fraud measures, and the evidence (the tail, or both legs of a bird).
  The programme (usually the municipality) decides the details, and the page says its instructions take precedence.
  The board of the manual's example (capture date, hunter's name, individual number) prints on A4 landscape, with a line to write on
  for an item left blank; it holds a name, so it is not saved. A chosen JPEG's date taken and GPS position are read from its Exif
  on the device, or reported as missing; they can be edited, so this is not proof. The board's lines can be drawn on a copy of the
  photo, which has no metadata. The payment estimate adds the prefectural and municipal amounts the user enters to the national upper
  limit per head in annex 4 of the FY2026 guideline of the wildlife damage grant (revised 7 April 2026, p.109). No national amount
  for young animals is written there, so it is entered by hand, and the rule for areas under shipping restrictions is not included.
- **Meat Yield Calculator** (肉の歩留まり計算): from a weight (whole animal, field-dressed or carcass), estimates the weight at each stage and the number of freezer packs.
  The only reference values are those in the Ministry of Agriculture's manuals (carcass 50 % for deer; usable meat about 20 % for deer and 30 % for wild boar);
  the rest are entered by the user. It does not judge whether meat is fit to eat.
  The usable meat can be split into cuts, each with its share and price per kg, for the sales; the cut names of the national game
  meat certification scheme's cut chart (deer and wild boar, checked 2026-09-24) can be filled in, but no share is given because
  the chart gives none. Costs per animal and a subsidy or other income are entered to give the balance per animal. Settings saved
  before the cuts were added still open, with no cuts or costs entered.
- **Cure and Sausage Calculator** (塩漬け・ソーセージの配合計算): from the lean, fat and water weights and the recipe's percentages
  (of the meat, or of the meat and water for an equilibrium brine), gives the grams of salt, curing agent and other ingredients.
  The salt in the curing agent counts towards the salt, and an agent whose salt and sodium nitrite come to more than 100 % is
  refused. The nitrite added is given per kg of the whole batch as mixed. It is not judged against the Japanese use standard
  for sodium nitrite (Specifications and Standards for Foods, Food Additives, etc., MHW Notification No. 370 of 1959, part 2 F:
  no more than 0.070 g of nitrite per kg may remain in a meat product; checked 2026-09-25), because that limit is on what
  remains in the finished product, which drying, heating and storage change and only testing shows. Sodium nitrite is
  converted to nitrite by IUPAC atomic weights. It also blends two trimmings to a fat share, and gives the link count, casing length and cost from prices the user
  enters. No recipe values are filled in. The cooking section quotes the MHLW game meat guideline (75 °C at the centre for
  1 minute or equivalent) and the manufacturing standard for heated meat products (63 °C for 30 minutes, a standard for
  licensed makers), and that selling meat products needs a meat product manufacturing licence (checked 2026-09-24).
- **Freezer Stock** (冷凍庫の在庫): records frozen meat by animal, cut (the cut chart's names are suggested), weight per pack,
  number of packs and the date frozen, lists it oldest first with the days since freezing and the totals, and takes packs out one
  at a time. No official storage period for frozen game meat was found, so the tool sets no use-by date; the user may enter one.
  It quotes the storage temperatures of the MHLW game meat guideline (packaged frozen meat at −15 °C or below) and of the MHLW
  home food poisoning page (checked 2026-09-24).
- **Age from Teeth** (歯による年齢の目安): answers about the lower jaw give a rough age class. Sika deer: milk first incisors
  are 0 years; wear classes I to IV of the permanent first incisor are 1, 2, 3–5 and 6 or more years, with the mean age by sex
  (Osaki 2003, Hyogo). Wild boar: read from the third molar forwards, using when each molar comes through (Tsuji and Yokoyama 2014,
  Hyogo, 1 May taken as the birthday); past the full third molar the age cannot be told from eruption. Both studies call their
  tables a rough guide. Nothing is saved (checked 2026-09-24).
- **Cuts and Butchering Guide** (部位と解体の手引き): the cuts of deer and wild boar under the names and division points of the
  national game meat certification scheme's cut chart, on a schematic drawn for this page, and a checklist of hygiene points
  for bleeding and gutting in the field, carrying and dressing at the facility, each with the words of the MHLW guideline it comes
  from (checked 2026-09-24). Ticks are not saved.
- **Antler Photo Measure** (角の写真計測): on a photo taken with the camera or chosen from a file, two taps on a reference object
  of known length set the scale, and points tapped along an antler, tusk or span give its length in cm; several named measures
  can be taken. Lengths on a photo are estimates. No trophy score is given: the CIC states that the content, structure and
  formulas of its measurement sheets are copyrighted and need its written approval to store in data processing systems, and
  B&C materials may not be reproduced without permission (checked 2026-09-24). The photo is neither saved nor sent.

- **Body and Antler Photo Measure** (写真で体長・角を測る): on a photo with a ruler or another object of known length beside the animal,
  place reference points A and B on its ends and enter its length; the scale is that length over the pixels between them.
  Body length is traced from the snout to the anus, and each antler as its own path from base to tip; each is the sum of the straight segments.
  The photo and the points stay in the page; only the reference length and the animal chosen are saved.
  An optional outline runs SlimSAM-77 (a slimmed Segment Anything) with ONNX Runtime Web in a Web Worker, on WebGPU where the browser has it
  and on WebAssembly otherwise, and the page says which. Taps on the animal (and on parts to leave out) prompt it. The model (13.8 MB) and
  the runtime (26.8 MB) are fetched only after the reader presses the button that states their size: the model from Hugging Face at a pinned revision, the runtime from this site.
  The model files are checked against their SHA-256 and kept in Cache Storage; they can be deleted from the page. The photo is not sent anywhere.
  From the outline the page gives its length along the principal axis, which can be used as the body points; it is not a body length itself.
  For wild boar the weight is estimated from the head and body length with the regressions of Abe (1986, Journal of the Mammalogical Society of Japan 11(3-4): 147–154,
  [doi:10.11238/jmammsocjapan1952.11.147](https://doi.org/10.11238/jmammsocjapan1952.11.147), checked 2026-09-24):
  log W = 3.38 log L − 5.34 (males) and 3.35 log L − 5.30 (females), W in kg without the chest and abdominal organs, L in cm from the snout to the anus.
  The range shown is one standard error of the estimate (0.06 and 0.05 on the log scale), and lengths outside those measured (60–151 cm, 60–135 cm) get no estimate.
  No weight is given for sika deer, as no body length to weight relation could be confirmed in a primary source.
  The page states the limits: the scale holds only in the plane of the reference, lens distortion, a general-purpose segmentation model,
  antler lengths as projected, and the population and method behind the regression.
- **Bear Incident Statistics** (クマの出没・被害統計): shows the Ministry of the Environment's figures for bear injuries, sightings and captures under permit
  (all preliminary), and emergency shootings, as tables and bar charts by year, prefecture and month.
  The figures are static data built from the material as of the date checked, and do not change when the ministry updates them.
- **Hunting Cost Calculator** (狩猟にかかる費用の計算): totals the hunting licence fees, hunter registration fees, hunting tax and entered costs
  such as club dues and insurance for three cases: the year the licences are first taken, a usual year with registrations only, and the renewal year.
  Registrations are entered per prefecture and licence, so hunting in several prefectures is added up.
  The tax follows Article 700-52 of the Local Tax Act (16,500 / 11,000 yen for class 1 gun, 8,200 / 5,500 yen for net and trap, 5,500 yen for class 2 gun;
  ¼ and ¾ for released-game hunting areas) and Supplementary Articles 32 and 32-2 (no tax for damage control team members and workers of certified
  capture businesses, half for those who captured under permit in the prefecture within the year before applying), which cover registrations up to 31 March 2029
  (rechecked on e-Gov on 2026-09-25). That day falls inside the 2028 registration year (16 April 2028 to 15 April 2029), so a registration with relief
  in that year needs the day it is made; settings saved before this field was added are discarded with a notice.
  How the relief combines with the released-game area rates is not set out, so that combination is not calculated.
  The fees default to the national standard of the Cabinet Order on standard local government fees (application 5,200 yen, 3,900 yen with part of the exam exempted,
  renewal 2,900 yen, registration 1,800 yen); prefectures set the actual fees by ordinance, so they can be edited. Checked on e-Gov on 2026-09-24.
- **Permit and Licence Deadlines** (所持許可・狩猟免許の期限): from the date of birth and the day a firearms permit was granted (or the day the
  permit before renewal ended), shows the last day of the permit (the third birthday after that day, with 29 February taken as 28 February;
  Article 7-2 of the Firearms Act) and the renewal application period (two to one month before; Article 34 of its Enforcement Regulations),
  and whether the cognitive test for holders 75 or older on the last day applies (Articles 4-3 and 7-3(3)); age is reached on the day
  before the birthday, or on 28 February in common years for those born on 29 February (Age Calculation Act and Civil Code Article 143,
  checked 2026-09-25). A hunting licence ends on 14 September of the year three years after the exam,
  and a renewed one three years after the last (Article 44 of the Wildlife Act, Article 60 of its Enforcement Regulations).
  The last day a course certificate and a skills course certificate count (three years counted from and including the day of issue, so the day before the same date three years later; Article 5-2) is shown when their dates are entered.
  These and any dates the user adds, such as a doctor's certificate, insurance or a club card, are exported as an `.ics` file of all-day events
  with optional reminders. A renewal checklist follows Articles 9, 10, 11, 16 and 34 and Table 2 of the Enforcement Regulations
  (hunting guns except competition shooters, and air guns).
  For each gun it shows whether two years in a row without use for a permitted purpose (Article 11(5), in force from 1 March 2025) have passed,
  counted from the day after the last use (a last use before the day of the permit is refused); for a permit held before that day, Supplementary Article 5 of the 2024 amendment reads three years
  and all purposes until some purpose goes two years unused after 1 March 2025. The National Police Agency's leaflet on what does not count as use is quoted.
  It only compares dates; whether a use counts and any action are for the public safety commission. Checked on e-Gov on 2026-09-24.
- **Cartridge Purchase Plan** (火薬類の消費（購入）計画): builds the attached sheet of Form 2 of the Cabinet Office Order on hunting-gun explosives
  (猟銃用火薬類等譲受許可申請書), whose columns are planned time, planned quantity (kind, quantity and reason), planned place and remarks.
  Each planned row is totalled by kind (cartridges, blanks, primers, smokeless and black powder) and compared with the quantities applied for;
  the acquisition period is checked against note 3 of the form (not more than one year) and each row against the period. The sheet prints on A4.
  The quantities one may acquire or use without a permit (Articles 4 and 12) are quoted for reference. Police stations differ in how detailed a plan they ask for.
  Japanese only. Checked on e-Gov on 2026-09-24.
- **Hunting Seasons and Bag Limits** (猟期と捕獲数制限の早見表): for a prefecture and a day, shows the national hunting season
  (15 November to 15 February, Hokkaido 1 October to 31 January; Article 9 of the Enforcement Regulations of the Wildlife Act),
  the national daily limits and bans (Article 10), and what the prefecture has published on top of them: season extensions and shortenings,
  bag limits and bans, each with the prefecture's wording, the quoted passage and a link to its page or notice.
  The prefectural rules are static data for the prefectures collected so far (12 in Kanto, Chubu and Tokai, checked on 2026-09-24),
  each with the date checked and the season its documents are for. Data for an earlier season than the current one is shown with a warning,
  and a prefecture not collected says so and links to its own page. Whether a place falls inside an area is not judged.
  The national season and the dated extensions and shortenings of the season can be exported as an `.ics` file.
- **Course and Exam Schedules** (講習会・試験の日程リンク集): links, by prefecture, to the official pages with the schedules of the hunting licence exam
  (prefectural wildlife offices), the firearms safety course and the skills course (prefectural police). Only pages opened and checked on
  2026-09-24 are listed (14 prefectures so far); the others say they are not collected, and pages for a single year are marked.
  Schedules are not copied or watched: the user enters the exam, course or application dates they chose and exports them as an `.ics` file
  with reminders a week and a day before.
  It links to the bear bell below.
- **Bear Bell and Encounter Guide** (熊鈴と遭遇時の備え): rings a bell sound synthesised with Web Audio (three tones, no recordings)
  at a fixed interval, optionally varied between 0.5 and 1.5 times it and in volume between 60 and 100 %, or with each step
  detected from the motion sensor (iOS asks for permission). A timer can stop it, and the Screen Wake Lock API keeps the screen on
  where the browser allows. The page states that a web page's sound can stop when the screen is locked or another app is shown:
  iOS Safari interrupts the audio (MDN), and no browser guarantees otherwise. It also says that no effect on bears is promised.
  A pre-trip checklist (kept until cleared), the staged actions for an encounter, the limits of a bell and the points on bear spray
  quote the Ministry of the Environment (the six rules of 2026, the injury analysis of April 2026, the 2021 manual, the spray
  requirements of August 2026), the government's public relations article of 10 September 2026, Akita Prefecture and the Consumer
  Affairs Agency, checked on 2026-09-24. Where they differ, the newer material is followed.

The field tools draw on a shared map (`components/labs/geo-map.tsx`) over the GSI tiles (地理院タイル: standard and pale maps
from zoom 5, photographs from zoom 14), credited as 地理院タイル with a link to GSI's tile list as GSI requires for real-time use
(checked 2026-09-24). Fetching tiles tells GSI roughly which area is on screen; the background can be set to なし (none),
which requests nothing. Tiles are not stored for offline use.

- **Bear Sighting Alerts** (クマ出没の通知): register up to five places with a radius of 1 to 20 km; every three hours the server reads Akita Prefecture's
  bear sighting open data (クマダス, CC BY 4.0, [catalogue](https://ckan.pref.akita.lg.jp/dataset/050008_shizenhogoka_003), checked 2026-09-24)
  with a conditional request and sends a Web Push for new bear sightings, signs and injuries dated within 30 days that fall inside a place.
  Only the id, kind, municipality, date and coordinates are read; addresses and descriptions are not. Alerts follow the prefecture's publishing
  and can lag days to months behind a sighting. The credit required by the licence is shown on the page and in each notification.
- **Course Page Watch** (講習会ページの更新通知): twice a day the server fetches the firearms course schedule pages of the Tokyo Metropolitan Police
  and the Saitama Prefectural Police, hashes the text of the page's content element, and notifies subscribers when it changes. The text is neither
  stored nor copied; the notification links to the page. Both sites publish no robots.txt, and their site policies allow links and reuse with
  attribution (checked 2026-09-24).
- **Return Check** (帰着予定の見守り): register the expected return time, a grace period and a short note, and share a watch link. At the return time
  the owner is reminded; after the grace period the owner's devices and the watchers are alerted by Web Push, three times an hour apart, until
  “I'm back” is pressed. The entry plan card can open it with `?returnAt=YYYY-MM-DDTHH:mm&note=…`. It sends no email or SMS and calls no one.
- **Party Location Sharing** (位置の共有（巻き狩り）): a room joined by an invitation link and a passphrase shares each member's latest position
  every five seconds, with distance and bearing from you. See _Server-backed tools_ for what is stored.
- **Trap and Fence Alerts** (わな・電気柵の遠隔通知): creates a secret URL that a trap sensor, fence monitor or automation service can POST to;
  the registered devices get a Web Push with the message (JSON `message`, `text` or `value1`, a form field, or plain text). GET never notifies.
  The URL can only raise alerts; adding devices and deleting the hook need a separate manage link that stays on the person's devices.
- **Match Results Page** (大会リザルトの公開): publishes a table pasted from a spreadsheet or CSV at `/labs/event-results/view#<id>`, kept out of
  search engines, editable with the organiser's passphrase and deleted after 7, 30 or 90 days. It is not an official record.

Records and settings are saved in the browser in use. They are not synced to other devices and are lost
if the browser's site data is cleared. Where saving is not possible, the page says so.

- **Back up and restore** (`/labs/data`, データの書き出し・読み込み): exports everything the tools keep in this browser
  (each tool's saved state, named settings, every hunter map with its picture and the open one, and attached photos) to one file,
  and reads such a file back. The file is JSON Lines (`.jsonl`): a header with the saved state and the counts, then one line per photo,
  and for each map a line with its settings followed by its picture in lines of at most 1 MiB, so the export and the restore handle
  one picture at a time and never hold one as text whole. The export estimates the size first and refuses, with the reason,
  a file over 256 MB. The file is not encrypted.
  The server-backed tools (bear alerts, course page watch, results pages, location sharing, return alerts, trap alerts) are left out:
  what they keep describes registrations on the server that belong to this browser's push subscription, and several hold the keys that
  control them (a plan's owner key, a hook's trigger and manage keys, a room's member key). Restored in another browser they would claim
  registrations it does not have, and the unencrypted file would let anyone holding it end a plan, send a hook's alert or read a room.
  They expire on the server within days to weeks. The return alert saves its plan under an exclusive Web Lock of its own
  (`nilay-labs-save:<key>`, taken inside the Labs session), reading the saved value again first, so tabs never undo each other's saves.
  Each part of the file is checked by the tool's own store before anything is written; a part that does not pass is listed and left out.
  A tool in the file replaces that tool's data; tools not in the file are left alone. Photos travel with their tool's records and only
  for records in the file. Maps or photos the export could not read are marked as not included and leave the device's own alone;
  an empty map list or photo list clears them.
  The restore is one unit: maps and photos are first written under keys of the restore, then swapped in, and what they replaced is kept
  as stored until every part is in. If a write fails, everything is put back. Every Labs page holds a shared Web Lock (`nilay-labs-open`)
  from before it first reads saved data until it closes; a restore takes it exclusively, so it runs only while no other Labs page is open,
  and a page opened during a restore waits for it. The data page takes the lock shared while it reads the device to export, so it never
  exports a device half restored. A note in localStorage lets a restore cut short (a closed tab) be undone by the next Labs page to open,
  before it reads anything. If that undo fails, the note is marked, the tools open without saving and do not try again, and `/labs/data`
  offers to try once more or to delete the note and keep the data as it is. A map picture is set aside only up to what the file could carry.
  Every store that saves to localStorage is listed in `app/(standalone)/labs/data/saved-data.ts`, including the study record shared by
  the study tools; a unit test reads every file that makes a persisted store and fails while one is missing.
- **Offline use**: `/labs` and each tool work without a connection once they have been opened. The service worker
  `public/labs-sw.js` (scope `/labs`, no dependencies) is registered by the Labs layout and the Labs list in production builds only.
  Pages come from the network first and from the kept copy when the network fails or takes over 4 seconds;
  `/_next/static` files and pictures are kept as they load. `/api/*`, server component requests and other sites are never cached.
  The cache is named after a version fixed at build time (`NEXT_PUBLIC_LABS_OFFLINE_VERSION`: the Vercel deployment, or the build time).
  A new version installs by fetching again every page the previous one kept, takes over at once, and deletes the older cache;
  if that fetch fails, the previous version stays in use. The species identification test asks for all its photos to be kept.
- **Photos** can be attached to a record (each outing in the hunting log, each round in the trap check log, and each animal in the game meat record, up to 4 there for the printed sheet): up to 10 per record, scaled to 1600 px on the
  longer side and re-encoded as JPEG, which drops the location a phone writes into a photo. They are kept in IndexedDB
  and deleted with their record.
- **Named settings** keep several sets of inputs under names beside a tool's own saved state (so far, bullets and barrels in twist rate and stability),
  and **links between tools** carry a value in the query string (velocity spread sends its average to twist rate and stability).
  A link that cannot be read changes nothing and says so. Tools add both with `createNamedSettingsStore` / `NamedSettings`
  and `defineHandoff` / `receiveHandoff`; `lib/csv.ts` writes CSV per RFC 4180 with typed text kept inert for spreadsheets.

### Server-backed tools

The six tools above use `app/api/labs/`, Vercel Cron (`vercel.json`) and Upstash Redis; without Upstash and the VAPID keys the APIs answer 503.
Web Push (RFC 8291 encryption and RFC 8292 VAPID) is implemented with `node:crypto`, without a library. Notifications work in browsers with
Web Push; on iPhone and iPad only from a site added to the Home Screen (iOS 16.4 or later). Delivery is never guaranteed, and each page says so.

What the server keeps, and for how long (every key expires on its own):

- A device's push subscription (endpoint, keys, language): 90 days after it was last registered. “Stop all notifications here” deletes it
  and the device's bear places and course pages at once.
- Bear alert places (latitude, longitude, radius): 90 days. Course pages chosen: 90 days.
- A return plan (time, grace, note, devices to notify): deleted by “I'm back” or “Cancel”, otherwise 24 hours after its last alert.
- A location room: each member's display name and **latest position only** (no track), sent only after the member presses the switch and only
  while the page is open. “Leave” deletes the member's name and position, the creator's “Close room” deletes everything, and the room is deleted
  when it ends (2 to 24 hours, chosen when it is made).
- A trap hook: its name and devices, 90 days after its last call or visit to the page, which also renew its devices' subscriptions;
  messages are not stored. Bear places and course pages are renewed the same way on each visit.
- A results page: its table until it expires.

Hook, room and plan credentials are stored as SHA-256 hashes and passphrases with scrypt. Passphrase tries are limited per address and
per room or page, counted in Redis so that an unreachable Redis refuses them. Anonymous creation is capped per day (rooms, results pages,
plans, hooks), with at most 200 open rooms and 300 results pages of up to 128 KiB. Room polling is limited per member, not per address.
Records and their places in the service-wide counts are written and deleted together in single Lua scripts, as are a
room's member limit, a hook's renewal with its devices, and the job lock; hooks and results pages are changed with compare and set.
Everything that changes a return plan or sends for it (the check, the return or cancel, a new time, a new watcher) holds a
per-plan lock that outlives the request holding it (90 s against a 60-second route limit); the holder checks it still has the
lock before sending, and every send and store request has its own timeout. A plan's messages therefore go out in the order of its
changes: a return pressed while an overdue alert is going out is sent after it, under the same notification tag. What to send (an
alert, or the return or cancel) is stored on the plan with the change that calls for it and removed after sending, so a request or
check that stops half-way is completed by the next check (at least once); devices not reached are tried again, three tries per device
(a device there was no time for keeps its tries). An ended plan is kept for a day without its note or devices, so pressing the return again is answered as done. A plan, its place in the check's schedule and its place in the count of held plans (scored by when the plan's record expires) are written in one Lua script, so they never disagree. Bear and course alerts go out as batches that resume across runs: the progress (a cursor in the index and the devices to try again) is saved after every page, so a run that runs out of time is continued, not restarted; a device is marked per batch after it is told, so registering again mid-scan does not tell it twice. A batch is named by its content and by the revision of the source or page it came from, so the same change happening again later is a new batch. A plan is made in two steps: creating it stores it unarmed for ten minutes (not scheduled, sends nothing); the page saves the keys and then arms it, which schedules it. If the answer to a creation is lost the page makes a new plan and the first one expires unannounced; arming is idempotent, so a lost answer to it is repaired by arming again. Every save of the page's plan and watched plans runs under one Web Lock over the values read again from the storage, and each tab takes in the others' saves (storage event), so a tab holding an older state never overwrites a plan's keys; the page makes one plan at a time (a browser without Web Locks is refused) and none while a plan is saved, arms a plan only after reading its keys back from the browser's storage, and shows an unarmed plan as not registered, without the watch link. An unarmed plan cannot be watched, read or moved, cancelling it tells no one, and one whose return time has passed is refused (410). Unarmed plans count toward the daily and total limits. One address may make 10 plans a day, and one device may have 3 plans armed at once (counted in the same script as the plan's writes), so one person cannot fill the check's queue. Devices found gone when an alert is sent are removed from the plan in the same write, so the watcher count stays true. Course alerts mark each page per device, so a retry does not repeat a page already told. A stored plan in a format this version does not read is counted in the job's result.
Stored subscriptions (50,000), watchers of each kind (20,000) and new subscriptions a day (5,000) are capped. The trap alerts page
asks the server for each hook's current expiry and forgets a hook only when the server no longer has it. Jobs page through their watchers, send a few at a time, mark each device per batch, and stop within
a time budget, leaving the rest for the next run. Each server instance has at most 25 push requests under way at once (5 per notification), handed round the notifications waiting one at a time, and holds a place only for the request, not while reading the subscription. The limit is per instance: sends come only from the scheduled jobs (each route runs once at a time under its cron lock) and from trap hooks (limited to 20 calls a minute per IP and 6 per hook). A push service gets 10 seconds to accept a message (5 seconds for the return-alert check). The return-alert check starts due plans 100 at a time, longest overdue first, and keeps taking the next hundred while it has time to start plans, so plans whose devices stall do not hold up the others; devices there was no time for stay queued without using up an attempt. Its worst case, with every store call and push running to its timeout, fits its route's 280-second limit (a Vercel Pro limit); a test holds that calculation. A call to a trap hook answers with the devices reached (`delivered`), not reached this time (`failed`) and registered (`devices`); a caller can call again when `failed` is not 0. Subscription keys must be points on P-256, and a VAPID key pair that does not
match stops the server at start. Room tokens, plan notes and results links kept in the browser are removed once they have expired on the server.
Browser writes must carry the site's `Origin`, bodies are size-limited, pushes go only to the FCM, Mozilla, Apple and Windows push services,
cron routes require `CRON_SECRET`, and logs replace hook tokens and room and page ids in paths.

## Search engines

- Each page gets a canonical URL (based on `https://about.nilay.jp`), Open Graph and an X card from `pageMetadata` in `lib/seo.ts`.
  Next.js does not merge `openGraph` and `twitter` with the parent layout's, so each page sets all of them.
- Structured data (JSON-LD): Organization and WebSite on every page, CollectionPage on the Labs list,
  WebApplication and a breadcrumb on each tool, and NewsArticle on each news article.
- `/sitemap.xml` lists the home page, Labs, each tool, the news list and the contact page; `/news/sitemap.xml`
  lists the microCMS articles. The latter is fetched from microCMS on each request and returns an error if it cannot be.
- `robots.txt` allows everything except `/api/` and names both sitemaps.
- The title and description of a news article are fetched from microCMS on the server. An article that does not exist returns 404.
  If microCMS cannot be reached, the error is logged and the page is served with a generic title and `noindex`
  (the article body is still fetched in the browser).

## Development

Use Node.js 24.x (24.16.0) and npm 11.13.0, and run from the repository root.

```bash
npm ci
cp packages/nilay-about/.env.example packages/nilay-about/.env.local
npm run dev --workspace=@sasakiuri/nilay-about
```

The development server runs at `http://localhost:3001`.
Fetching news needs `MICROCMS_SERVICE_DOMAIN` and `MICROCMS_API_KEY`, and sending contact messages needs `SLACK_WEBHOOK_URL`.
They can be left unset when working on pages that do not use those services.
Features live in `features/` and shared server code in `lib/server/`.
See the [development guide](DEVELOPMENT.md) (in Japanese) for environment variables and the architecture.

```bash
npm run lint --workspace=@sasakiuri/nilay-about
npm run typecheck --workspace=@sasakiuri/nilay-about
npm run test --workspace=@sasakiuri/nilay-about
npm run test:coverage --workspace=@sasakiuri/nilay-about
npm run build --workspace=@sasakiuri/nilay-about
```

The microCMS settings are checked when the news API is requested, so a build needs no credentials.
See the [microCMS guide](microcms/README.md) (in Japanese) for creating the news API and editing content.

Start the production server on port 3001 with `npm run start --workspace=@sasakiuri/nilay-about`.
Production needs `NEXT_PUBLIC_SITE_URL` and a `LOG_MASKING_SECRET` of at least 16 characters.
Generate the secret with `openssl rand -hex 32` and use a strong, securely stored value in production.

Run the end-to-end tests after a build.

```bash
npm run build --workspace=@sasakiuri/nilay-about
npm run test:install --workspace=@sasakiuri/nilay-about
npm run test:e2e --workspace=@sasakiuri/nilay-about
```

Playwright starts the production server with test-only environment variables.
It does not reuse an existing server on port 3001 and does not connect to the real microCMS, Slack or Upstash.

## Origin and history

The committed files of `packages/about.website/` at commit `cf622d7ce7b001dd0f4d9fd86138a2415fc03b82` of `sasakiuri/nilay` were imported.
The 104 commits from its time as a standalone repository and the 57 commits inside Nilay, 161 in total,
are kept as linear history following the existing OSS history.

Authors and dates were kept, and messages were converted to English Conventional Commits with the `nilay-about` scope.
Each commit's `Nilay-Commit` trailer records the original commit ID.
Credential values in the history are redacted in 23 blobs.
The tip snapshot before the merge matches the source, with workspace changes made afterwards.
The source repository was not changed, and no uncommitted changes were imported.

This package is `private: true` and is not published to npm.
It is versioned independently of the Saika suite.

## Licence

The original Nilay [MIT licence](LICENSE) and `Copyright (c) 2022 Nilay` are kept.
Keep any notices attached to individual assets as well.

Three photos in the game species identification were taken from Wikimedia Commons, cropped and resized:

| File                                     | Species        | Source                                                                                                               | Licence       |
| ---------------------------------------- | -------------- | -------------------------------------------------------------------------------------------------------------------- | ------------- |
| `public/images/game-species/117_001.jpg` | ノイヌ         | [Feral Dog.jpg](https://commons.wikimedia.org/wiki/File:Feral_Dog.jpg)                                               | Public domain |
| `public/images/game-species/118_001.jpg` | ノネコ         | [Stray cat standing in the street.JPG](https://commons.wikimedia.org/wiki/File:Stray_cat_standing_in_the_street.JPG) | CC0 1.0       |
| `public/images/game-species/119_001.jpg` | シベリアイタチ | [Mustela sibirica 230828854.jpg](https://commons.wikimedia.org/wiki/File:Mustela_sibirica_230828854.jpg)             | CC0 1.0       |

The non-game species in the identification practice (exam style and the look-alike comparison) are photos from Wikimedia Commons,
chosen only under CC0, public domain or CC BY, cropped to a square and resized to 400 × 400 px (checked 2026-09-24).
They were downloaded with a User-Agent that names the project only.

| File                                     | Species              | Source                                                                                                                                                                                                        | Author                                | Licence                                                         |
| ---------------------------------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- | --------------------------------------------------------------- |
| `public/images/game-species/501_001.jpg` | オシドリ             | [Mandarin duck (Aix galericulata) on ice 02.jpg](<https://commons.wikimedia.org/wiki/File:Mandarin_duck_(Aix_galericulata)_on_ice_02.jpg>)                                                                    | Stephan Sprinz                        | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/502_001.jpg` | トモエガモ           | [Sibirionetta formosa 01.jpg](https://commons.wikimedia.org/wiki/File:Sibirionetta_formosa_01.jpg)                                                                                                            | Sun Jiao (Interaccoonale)             | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/503_001.jpg` | アカハジロ           | [Aythya baeri cropped.jpg](https://commons.wikimedia.org/wiki/File:Aythya_baeri_cropped.jpg)                                                                                                                  | Sun Jiao (Interaccoonale)             | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/504_001.jpg` | ホオジロガモ         | [Bucephala Clangula Oulu 20100502.JPG](https://commons.wikimedia.org/wiki/File:Bucephala_Clangula_Oulu_20100502.JPG)                                                                                          | Estormiz                              | Public domain                                                   |
| `public/images/game-species/505_001.jpg` | ミコアイサ           | [Mergellus-albellus-London.JPG](https://commons.wikimedia.org/wiki/File:Mergellus-albellus-London.JPG)                                                                                                        | Bert Seghers                          | [CC0](http://creativecommons.org/publicdomain/zero/1.0/deed.en) |
| `public/images/game-species/506_001.jpg` | カワアイサ           | [Mergus merganser -Sandwell -England -male-8.jpg](https://commons.wikimedia.org/wiki/File:Mergus_merganser_-Sandwell_-England_-male-8.jpg)                                                                    | Tony Hisgett                          | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0)        |
| `public/images/game-species/507_001.jpg` | マガン               | [Greater white-fronted goose (Anser albifrons) 2022.jpg](<https://commons.wikimedia.org/wiki/File:Greater_white-fronted_goose_(Anser_albifrons)_2022.jpg>)                                                    | TRinaud                               | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/508_001.jpg` | オオバン             | [Eurasian Coot at Wallnau, Fehmarn.jpg](https://commons.wikimedia.org/wiki/File:Eurasian_Coot_at_Wallnau,_Fehmarn.jpg)                                                                                        | Herring404                            | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/509_001.jpg` | バン                 | [Waterhoen 1-4-17 (33617378382).jpg](<https://commons.wikimedia.org/wiki/File:Waterhoen_1-4-17_(33617378382).jpg>)                                                                                            | Bas van Oorschot from The Netherlands | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0)        |
| `public/images/game-species/510_001.jpg` | ゴイサギ             | [Nycticorax nycticorax nycticorax (44354186612).jpg](<https://commons.wikimedia.org/wiki/File:Nycticorax_nycticorax_nycticorax_(44354186612).jpg>)                                                            | LiCheng Shih                          | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0)        |
| `public/images/game-species/511_001.jpg` | ウミウ               | [Phalacrocorax capillatus from iNaturalist photo 525002293.jpg](https://commons.wikimedia.org/wiki/File:Phalacrocorax_capillatus_from_iNaturalist_photo_525002293.jpg)                                        | Andrew Bazdyrev (andrewbazdyrev)      | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/512_001.jpg` | ライチョウ           | [ライチョウ20220507-IMG 2046.jpg](https://commons.wikimedia.org/wiki/File:%E3%83%A9%E3%82%A4%E3%83%81%E3%83%A7%E3%82%A620220507-IMG_2046.jpg)                                                                 | くろふね                              | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/513_001.jpg` | ウズラ               | [Japanese Quail.jpg](https://commons.wikimedia.org/wiki/File:Japanese_Quail.jpg)                                                                                                                              | Ingrid Taylar                         | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0)        |
| `public/images/game-species/514_001.jpg` | アオバト             | [2018-01-22 Treron sieboldii, Osaka, Japan 1.jpg](https://commons.wikimedia.org/wiki/File:2018-01-22_Treron_sieboldii,_Osaka,_Japan_1.jpg)                                                                    | Jin Kemoole                           | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0)        |
| `public/images/game-species/515_001.jpg` | カワラバト（ドバト） | [Feral pigeon 2022 03 18 01.jpg](https://commons.wikimedia.org/wiki/File:Feral_pigeon_2022_03_18_01.jpg)                                                                                                      | Alexis Lours                          | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/517_001.jpg` | ツグミ               | [Turdus eunomus - Forest Botial-Jarvis - 616099817 (cropped).jpeg](<https://commons.wikimedia.org/wiki/File:Turdus_eunomus_-_Forest_Botial-Jarvis_-_616099817_(cropped).jpeg>)                                | Forest Botial-Jarvis                  | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/518_001.jpg` | ホオジロ             | [Emberiza cioides -Japan-8.jpg](https://commons.wikimedia.org/wiki/File:Emberiza_cioides_-Japan-8.jpg)                                                                                                        | coniferconifer from japan             | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0)        |
| `public/images/game-species/519_001.jpg` | コクマルガラス       | [Coloeus dauuricus, adult, Izumi, Kagoshima, Japan 1.jpg](https://commons.wikimedia.org/wiki/File:Coloeus_dauuricus,_adult,_Izumi,_Kagoshima,_Japan_1.jpg)                                                    | christoph_moning                      | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/520_001.jpg` | オオジシギ           | [Latham's Snipe (25203522309).jpg](<https://commons.wikimedia.org/wiki/File:Latham%27s_Snipe_(25203522309).jpg>)                                                                                              | Ed Dunens                             | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0)        |
| `public/images/game-species/521_001.jpg` | イソヒヨドリ         | [BlueRock-Thrush.jpg](https://commons.wikimedia.org/wiki/File:BlueRock-Thrush.jpg)                                                                                                                            | Daniel Polin                          | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |
| `public/images/game-species/601_001.jpg` | ニホンカモシカ       | [Japanese serow (Capricornis crispus) ニホンカモシカ.jpg](<https://commons.wikimedia.org/wiki/File:Japanese_serow_(Capricornis_crispus)_%E3%83%8B%E3%83%9B%E3%83%B3%E3%82%AB%E3%83%A2%E3%82%B7%E3%82%AB.jpg>) | Ken Ishigaki                          | [CC BY 2.0](https://creativecommons.org/licenses/by/2.0)        |
| `public/images/game-species/602_001.jpg` | ニホンリス           | [Japanese Squirrel.jpg](https://commons.wikimedia.org/wiki/File:Japanese_Squirrel.jpg)                                                                                                                        | Ma2bara                               | Public domain                                                   |
| `public/images/game-species/604_001.jpg` | ニホンザル           | [Macaca fuscata 166252187.jpg](https://commons.wikimedia.org/wiki/File:Macaca_fuscata_166252187.jpg)                                                                                                          | Mark Bolnik                           | [CC BY 4.0](https://creativecommons.org/licenses/by/4.0)        |

The outline model in Body and Antler Photo Measure is the unmodified 8-bit ONNX export of SlimSAM-77, fetched by the browser
published as [Xenova/slimsam-77-uniform](https://huggingface.co/Xenova/slimsam-77-uniform) (revision `5850ab45f587c112167512ffef949107115e26a0`),
under the Apache License 2.0, as are [SlimSAM](https://github.com/czg1225/SlimSAM) and [Segment Anything](https://github.com/facebookresearch/segment-anything) (checked 2026-09-24).
It is not part of this repository or the site's files.

The browser AI models that were considered and not used, checked 2026-09-24:

| Model                                                                                                   | Licence                                                                                                                                                                                                   | Why it is not used                                                                                |
| ------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| [MegaDetector](https://github.com/agentmorris/MegaDetector) v5 and v1000 (redwood, cedar, spruce)       | Code MIT; the [release notes](https://github.com/agentmorris/MegaDetector/blob/main/docs/release-notes/mdv1000-release.md) give the inference libraries as GPL, and PyTorch-Wildlife lists v5 as AGPL-3.0 | GPL or AGPL                                                                                       |
| MegaDetector v1000 larch and sorrel, and the Ultralytics-based MegaDetector v6 models                   | AGPL-3.0                                                                                                                                                                                                  | AGPL                                                                                              |
| [MegaDetector v6](https://github.com/microsoft/Biodiversity) MIT (YOLOv9) and Apache (RT-DETR) variants | MIT or Apache 2.0 in the model zoo; the [Zenodo record](https://zenodo.org/records/15398270) says CC BY 4.0                                                                                               | No published ONNX; checkpoints of 119–1,225 MB need converting and hosting outside the repository |
| [BirdNET](https://github.com/birdnet-team/BirdNET-Analyzer) v2.4                                        | Model CC BY-NC-SA 4.0                                                                                                                                                                                     | Non-commercial                                                                                    |
| [BirdNET+ V3.0](https://zenodo.org/records/20703646) preview                                            | CC BY-SA 4.0 with use restrictions                                                                                                                                                                        | A preview for research and evaluation, with share-alike terms and use restrictions                |
| [Perch 2.0](https://www.kaggle.com/models/google/bird-vocalization-classifier)                          | Apache 2.0                                                                                                                                                                                                | About 410 MB, too large for the repository and for a browser download                             |
| [EdgeSAM](https://github.com/chongzhou96/EdgeSAM)                                                       | NTU S-Lab License 1.0                                                                                                                                                                                     | Non-commercial                                                                                    |

The licences of the dependencies are included in the [third-party notices](THIRD-PARTY-LICENSES.txt).
