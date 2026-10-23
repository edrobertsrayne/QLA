Model openai/gpt-6-luna, 3 rep(s). TP/FP/FN after local checks; raw = pairs the model proposed.

| Case        | Variant   | True   | Raw | Kept | TP  | FP  | FN  | Dropped by checks | s   | ¢   |
| ----------- | --------- | ------ | --- | ---- | --- | --- | --- | ----------------- | --- | --- |
| 8463 P1 H   | F         | bare   | 13  | 13   | 13  | 13  | 0   | 0                 |     | 5   | 2.03 |
| 8463 P1 H   | F         | bare   | 13  | 13   | 13  | 13  | 0   | 0                 |     | 7   | 2.02 |
| 8463 P1 H   | F         | bare   | 13  | 13   | 13  | 13  | 0   | 0                 |     | 5   | 2.04 |
| 8463 P1 H   | F         | quoted | 13  | 13   | 13  | 13  | 0   | 0                 |     | 6   | 2.05 |
| 8463 P1 H   | F         | quoted | 13  | 13   | 13  | 13  | 0   | 0                 |     | 4   | 2.05 |
| 8463 P1 H   | F         | quoted | 13  | 13   | 13  | 13  | 0   | 0                 |     | 7   | 2.05 |
| 8463 P2 F   | H         | bare   | 14  | 14   | 14  | 14  | 0   | 0                 |     | 5   | 2.55 |
| 8463 P2 F   | H         | bare   | 14  | 14   | 14  | 14  | 0   | 0                 |     | 5   | 2.55 |
| 8463 P2 F   | H         | bare   | 14  | 14   | 14  | 14  | 0   | 0                 |     | 4   | 2.54 |
| 8463 P2 F   | H         | quoted | 14  | 14   | 14  | 14  | 0   | 0                 |     | 5   | 2.57 |
| 8463 P2 F   | H         | quoted | 14  | 14   | 14  | 14  | 0   | 0                 |     | 6   | 2.59 |
| 8463 P2 F   | H         | quoted | 14  | 14   | 14  | 14  | 0   | 0                 |     | 5   | 2.57 |
| 1MA1 P1 F   | H         | bare   | 9   | 12   | 12  | 9   | 3   | 0                 |     | 3   | 1.63 |
| 1MA1 P1 F   | H         | bare   | 9   | 12   | 12  | 9   | 3   | 0                 |     | 3   | 1.63 |
| 1MA1 P1 F   | H         | bare   | 9   | 12   | 12  | 9   | 3   | 0                 |     | 2   | 1.63 |
| 1MA1 P1 F   | H         | quoted | 9   | 12   | 12  | 9   | 3   | 0                 |     | 3   | 1.66 |
| 1MA1 P1 F   | H         | quoted | 9   | 12   | 12  | 9   | 3   | 0                 |     | 3   | 1.67 |
| 1MA1 P1 F   | H         | quoted | 9   | 12   | 12  | 9   | 3   | 0                 |     | 4   | 1.66 |
| 8300 P1 H   | F         | bare   | 5   | 7    | 7   | 5   | 2   | 0                 |     | 4   | 1.56 |
| 8300 P1 H   | F         | bare   | 5   | 7    | 7   | 5   | 2   | 0                 |     | 3   | 1.56 |
| 8300 P1 H   | F         | bare   | 5   | 7    | 7   | 5   | 2   | 0                 |     | 2   | 1.57 |
| 8300 P1 H   | F         | quoted | 5   | 7    | 7   | 5   | 2   | 0                 |     | 3   | 1.59 |
| 8300 P1 H   | F         | quoted | 5   | 7    | 7   | 5   | 2   | 0                 |     | 2   | 1.58 |
| 8300 P1 H   | F         | quoted | 5   | 7    | 7   | 5   | 2   | 0                 |     | 3   | 1.58 |
| 8463 P1 H   | F MS only | bare   | 13  | 13   | 13  | 13  | 0   | 0                 |     | 2   | 1.35 |
| 8463 P1 H   | F MS only | bare   | 13  | 13   | 13  | 13  | 0   | 0                 |     | 2   | 1.36 |
| 8463 P1 H   | F MS only | bare   | 13  | 13   | 13  | 13  | 0   | 0                 |     | 2   | 1.35 |
| 8463 P1 H   | F MS only | quoted | 13  | 13   | 13  | 13  | 0   | 0                 |     | 2   | 1.41 |
| 8463 P1 H   | F MS only | quoted | 13  | 13   | 13  | 13  | 0   | 0                 |     | 2   | 1.41 |
| 8463 P1 H   | F MS only | quoted | 13  | 13   | 13  | 13  | 0   | 0                 |     | 2   | 1.40 |
| NEG 8463 1H | 2F        | bare   | 0   | 0    | 0   | 0   | 0   | 0                 |     | 6   | 2.19 |
| NEG 8463 1H | 2F        | bare   | 0   | 0    | 0   | 0   | 0   | 0                 |     | 5   | 2.20 |
| NEG 8463 1H | 2F        | bare   | 0   | 0    | 0   | 0   | 0   | 0                 |     | 6   | 2.22 |
| NEG 8463 1H | 2F        | quoted | 0   | 0    | 0   | 0   | 0   | 0                 |     | 5   | 2.20 |
| NEG 8463 1H | 2F        | quoted | 0   | 0    | 0   | 0   | 0   | 0                 |     | 5   | 2.19 |
| NEG 8463 1H | 2F        | quoted | 0   | 0    | 0   | 0   | 0   | 0                 |     | 5   | 2.21 |
| NEG 1MA1-1H | 8300-1F   | bare   | 0   | 0    | 0   | 0   | 0   | 0                 |     | 3   | 1.58 |
| NEG 1MA1-1H | 8300-1F   | bare   | 0   | 0    | 0   | 0   | 0   | 0                 |     | 3   | 1.57 |
| NEG 1MA1-1H | 8300-1F   | bare   | 0   | 0    | 0   | 0   | 0   | 0                 |     | 3   | 1.58 |
| NEG 1MA1-1H | 8300-1F   | quoted | 0   | 0    | 0   | 0   | 0   | 0                 |     | 3   | 1.58 |
| NEG 1MA1-1H | 8300-1F   | quoted | 0   | 0    | 0   | 0   | 0   | 0                 |     | 4   | 1.57 |
| NEG 1MA1-1H | 8300-1F   | quoted | 0   | 0    | 0   | 0   | 0   | 0                 |     | 2   | 1.58 |

| Variant | Precision     | Recall         | Errors | Total ¢ |
| ------- | ------------- | -------------- | ------ | ------- |
| bare    | 162/177 = 92% | 162/162 = 100% | 0      | 38.7    |
| quoted  | 162/177 = 92% | 162/162 = 100% | 0      | 39.2    |

### Misses and false pairs

- 1MA1 P1 F|H / bare: FP 20|1; 21a|2a; 21b|2b · FN —
- 1MA1 P1 F|H / bare: FP 20|1; 21a|2a; 21b|2b · FN —
- 1MA1 P1 F|H / bare: FP 20|1; 21a|2a; 21b|2b · FN —
- 1MA1 P1 F|H / quoted: FP 20|1 “Find an expression, in terms of n, for the nth term”; 21a|2a “Work out 3 4/5 − 1 2/3”; 21b|2b “What mistake has Kevin made?” · FN —
- 1MA1 P1 F|H / quoted: FP 20|1 “Find an expression, in terms of n, for the nth term of this sequence”; 21a|2a “Work out 3 4/5 − 1 2/3”; 21b|2b “What mistake has Kevin made?” · FN —
- 1MA1 P1 F|H / quoted: FP 20|1 “Find an expression, in terms of n, for the nth term”; 21a|2a “Work out 3 4/5 − 1 2/3”; 21b|2b “What mistake has Kevin made?” · FN —
- 8300 P1 H|F / bare: FP 6|19; 7|21 · FN —
- 8300 P1 H|F / bare: FP 6|19; 7|21 · FN —
- 8300 P1 H|F / bare: FP 6|19; 7|21 · FN —
- 8300 P1 H|F / quoted: FP 6|19 “How much money does Carl receive?”; 7|21 “Work out the value of a. You must show your working.” · FN —
- 8300 P1 H|F / quoted: FP 6|19 “Andrew and Bruce share some money in the ratio 5 : 6”; 7|21 “Work out the value of a. You must show your working.” · FN —
- 8300 P1 H|F / quoted: FP 6|19 “How much money does Carl receive?”; 7|21 “Work out the value of a.” · FN —
