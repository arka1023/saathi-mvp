# Saathi data: Level 1, Level 2 and the year of history behind them

Saathi ranks products on two layers of data:

- **Level 1** is what a seller lists: category, colour, fabric, sizes, price, stock, delivery days.
- **Level 2** is what a year of orders, returns, reviews and searches taught. For example: the M runs 2 cm small, buyers in humid cities send it back for heat, most people wear it to mehendis, and it's bought with silver jhumkas.

Search, the fit agent, the stylist, the deal agent and the returns guard all read Level 2. The **Data lab** tab shows every product side by side (Level 1 next to Level 2).

## What is real and what is simulated

| | |
| --- | --- |
| Products | 619 synthetic products: 403 women's and 216 men's, across 24 fictional brands priced like real Indian marketplace tiers. They include green sarees from ₹899, green sandals and American-diamond (cubic zirconia) jewellery, added when a real test request ("green saree, to go with diamond necklace, and green sandals") found nothing. |
| Product names | Fourteen names were corrected to match the product: four jeans named for the wrong cut, five office shirts named "resort" or "casual", and five office co-ords named "lounge". Names don't feed the simulation, so the history and Level 2 data are unchanged. |
| Product images | Studio renders drawn by the app. There are no product photos (see "Using real photos" below). |
| History | Simulated: 14,000 customers, 67,052 orders, 92,972 order lines, 29,610 returns (31.9%), 3,970 exchanges, 16,921 reviews and 120,693 searches. Period: Nov 2025 to Oct 2026. Each product has a listing date, and no order or review comes before it, so a product marked "New" has only a few weeks of history. |
| Assortment research | Real public reporting on what sells on Indian fashion platforms (sources below). It decided which categories, colours and price tiers the catalogue covers. |
| Hidden truths | The simulator gives each product a true cut, lining, colour accuracy and quality. These drive the simulated orders and returns. The analysis never reads them; they are used only to score it (see "How well it works"). They are not shipped with the site. |

## Files

| File | What it is |
| --- | --- |
| `level1_catalogue.csv` | Level 1 listing: one row per product. |
| `level2_insights.csv` | Level 2 facts: one row per product, derived from history. |
| `catalog.json` | What the app loads: Level 1 and Level 2 for each product. |
| `analysis.json` | The summary behind the Data lab and Impact tabs: findings, charts, search vocabulary, validation and the counterfactual used by the Impact sliders. |
| `history/orders.csv` | One row per order line: date, city, product, size, price paid, sale event, occasion, the search that led to it and its language. Also: returned or not, return reason, exchange, delivery days, temperature and humidity at delivery, and the buyer's body shape. |
| `history/reviews.csv` | Rating, tags (runs small, breathable, colour as shown…), text, occasion, city. |
| `history/searches.csv` | Search demand by department, category, colour and budget, with results in catalogue v1 (100 products) and v2 (619). |
| `history/customers.csv` | Department, city, age band, body shape, measurements in cm, usual size, price band. |
| `history/summary.json` | Headline counts and the return-reason mix. |

### Level 1 columns (`level1_catalogue.csv`)

`sku_id`, `name`, `listing_title`, `brand`, `department`, `category`, `sub_category`, `colour`, `hex`, `pattern`, `fabric`, `neckline`, `sleeve`, `silhouette`, `fit`, `price_inr`, `mrp_inr`, `regular_price_inr`, `on_diwali_sale`, `sizes`, `stock_by_size`, `ship_days`, `seller_occasion_tags`, `details`, `highlights`, `description`, `size_chart_cm`, `image_url` (left blank on purpose).

### Level 2 columns (`level2_insights.csv`)

| Column | Meaning |
| --- | --- |
| `units_sold`, `units_last_30d`, `trend_vs_prev_30d`, `rank_in_category`, `bestseller`, `trending` | Popularity |
| `return_rate`, `return_rate_95ci`, `top_return_reasons` | Returns, with a Wilson 95% interval |
| `size_verdict`, `size_tight_share`, `size_base_tight`, `size_adjust_cm`, `size_confidence` | True fit against the size chart, and the learned cut in cm |
| `heat_verdict`, `heat_score`, `hot_orders`, `warmth_return_share` | How it does in hot or humid weather |
| `worn_for` | The occasions buyers actually wore it for |
| `colour_verdict` | Whether colour returns run above the category norm |
| `rating`, `reviews`, `quality_verdict`, `quality_score`, `customers_say` | Quality and what reviews say |
| `bought_with` | Pieces bought in the same order, with lift |
| `keeps_well_for_shapes`, `returned_more_by_shapes` | Body shapes that keep it, or send it back |
| `popular_in`, `peak_months` | Where and when it sells |
| `great_value`, `regular_price`, `lowest_90d`, `lowest_90d_event`, `lowest_in_90d` | Price history; "lowest in 90 days" is shown only when it's true |
| `found_by_searching` | The searches that led to purchases |

## How Level 2 is derived

| Insight | Method |
| --- | --- |
| Search vocabulary | Every word and word pair in searches that led to a purchase, matched against what was bought. A term counts when it points to the same colour, category or occasion in at least 60% of 25+ searches. This found 901 terms, 224 of them not English (lal = red, शादी = wedding). |
| True cut (cm) | A category curve of "too tight" and "too loose" returns by ease deviation, fitted from buyers' measurements. Then, per product, the cm offset that best explains its own returns (maximum likelihood, pulled towards 0). The offset is kept only when it clearly beats "no offset". |
| Runs small or large | The brand's grading plus the learned cut: what someone buying their usual size actually gets. |
| Weather | Warmth returns on orders delivered at ≥32 °C or ≥72% humidity, blended with "breathable" and "too warm" review mentions. |
| Worn for | The occasion behind each purchase, taken from the search that led to it. |
| Bought together | lift = P(A and B) / (P(A) × P(B)). A pair is kept when lift ≥ 1.5 and it was seen at least 4 times. |
| Colour accuracy | "Colour different from photo" returns against the category baseline (z-test). |
| Quality | Average rating, adjusted by praise (premium feel, soft) and complaints (thin, loose threads, fading). |
| Body shapes | Return rate by the buyer's body shape, with at least 15 orders per shape. |
| Price history | The lowest price each product sold at in the last 90 days, sale events included. |
| Trend and bestseller | Units in the last 30 days against the 30 before; bestseller means the top 12% of the category by units. |

## How well it works

Each Level 2 flag was scored against the simulator's hidden truths, which the analysis never reads:

| Check | Precision | Recall |
| --- | --- | --- |
| Runs small | 74% | 79% |
| Runs large | 95% | 88% |
| Hidden cut (cm off the chart) | 95% | 84%; mean error 0.4 cm |
| Runs warm in humid weather | 81% | 56% |
| Colour differs from photo | 86% | 98% |

- Quality score against hidden quality: correlation 0.61.
- Hidden linings found: 7 of 11.
- Searches with no exact match: 73% against catalogue v1 (100 products), 17% against v2 (619 products).

## Assortment research (public sources)

- **Festive-sale velocity.** Myntra's festive sale opened at about 700 t-shirts, 420 jeans and 330 pairs of shoes a minute; Meesho's at about 506 kurtis and 376 sarees a minute. [Outlook Money, 30 Sep 2024](https://outlookmoney.com/spend/700-t-shirts-420-jeans-and-330-pairs-of-shoes-flying-off-the-shelf-per-minute-how-are-shoppers-going-big-on-festive-sales)
- **Occasion wear.** Myntra saw women's occasion wear grow 50% year on year in the 2026 wedding season, led by lehenga cholis and co-ord sets. [Apparel Resources, 7 Jul 2026](https://apparelresources.com/business-news/retail/myntra-reports-50-growth-in-womens-occasion-wear-demand/)
- **Meesho best sellers.** Kurtis, sarees, men's t-shirts and casual shirts, artificial jewellery and casual footwear. [Shiprocket, 16 Mar 2026](https://www.shiprocket.in/blog/most-selling-products-on-meesho/)
- **Festive colours.** Gold and yellow, red, green, pink, blue and orange; black for evening events. [Aza Fashions, 20 Aug 2026](https://www.azafashions.com/blog/diwali-outfit-guide-colors-meanings-what-to-wear/)
- **2026 ethnic colour trends.** Jewel tones, pastels, earthy shades, ivory, maroon and fuchsia. [Lashkaraa (2026)](https://www.lashkaraa.com/blogs/lashkaraa/indian-ethnic-color-silhouette-trends-2026)
- **Everyday basics.** Black, white, sky blue, grey, beige and navy. This is seller guidance, not sales data. [Qikink, Jul 2026](https://qikink.com/blog/most-popular-t-shirt-colors/)

## Using real photos

Only use photos you have the rights to: your own shoot, or images your supplier licenses to you. Product photos from other websites are someone else's copyright.

To show your photos on the hosted site:

1. Put them in an `images/` folder next to `index.html`.
2. Open `index.html` and fill in the photo list near the top, for example:

   ```js
   window.SAATHI_PHOTOS = { "SA-001": "images/SA-001.jpg" };
   ```

A listed photo replaces the studio render on cards and as the first image on the product page. Products without a photo keep their render.

## Rebuilding the data

From the project folder:

```bash
python3 tools/gen_catalog.py    # Level 1 catalogue and hidden truths
python3 tools/gen_history.py    # the simulated year of customers, orders, returns, reviews, searches
python3 tools/enrich.py         # Level 2 facts, analysis.json and the CSVs
python3 tools/build.py          # the app, the hosted site and the zip
```

Every step is seeded, so the same inputs always give the same files.
