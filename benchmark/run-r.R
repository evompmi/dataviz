# benchmark/run-r.R — runs reference statistics in R 4.5 on a bank of real
# datasets and writes the results to benchmark/results-r.json. Matches the
# options used by tools/stats.js so the comparison is apples-to-apples.
#
# Run with: Rscript benchmark/run-r.R
#
# Brown-Forsythe Levene, Games-Howell, and Dunn-BH are implemented inline to
# avoid dependencies on car / PMCMRplus / FSA (keeps reproduction simple).

suppressPackageStartupMessages(library(jsonlite))
suppressPackageStartupMessages(library(datasets))

# ── Inline implementations matching tools/stats.js ─────────────────────────

brown_forsythe <- function(values, groups) {
  groups <- as.factor(groups)
  meds <- tapply(values, groups, median)
  z <- abs(values - meds[as.character(groups)])
  a <- summary(aov(z ~ groups))[[1]]
  list(statistic = unname(a[["F value"]][1]), p = unname(a[["Pr(>F)"]][1]))
}

games_howell <- function(values, groups) {
  groups <- as.factor(groups)
  lvl <- levels(groups)
  k <- length(lvl)
  ns <- tapply(values, groups, length)
  ms <- tapply(values, groups, mean)
  vs <- tapply(values, groups, var)
  pairs <- list()
  for (i in 1:(k - 1)) {
    for (j in (i + 1):k) {
      d <- ms[j] - ms[i]
      se <- sqrt(vs[i] / ns[i] + vs[j] / ns[j])
      t <- d / se
      df_num <- (vs[i] / ns[i] + vs[j] / ns[j])^2
      df_den <- (vs[i] / ns[i])^2 / (ns[i] - 1) + (vs[j] / ns[j])^2 / (ns[j] - 1)
      df <- df_num / df_den
      # Games-Howell uses studentized range statistic: q = sqrt(2) * |t|
      q <- sqrt(2) * abs(t)
      p <- ptukey(q, nmeans = k, df = df, lower.tail = FALSE)
      pairs[[length(pairs) + 1]] <- list(i = lvl[i], j = lvl[j], pAdj = unname(p))
    }
  }
  pairs
}

dunn_bh <- function(values, groups) {
  groups <- as.factor(groups)
  lvl <- levels(groups)
  k <- length(lvl)
  N <- length(values)
  # Rank all, compute mean rank per group, with tie correction
  r <- rank(values)
  ns <- tapply(values, groups, length)
  mean_r <- tapply(r, groups, mean)
  # Tie correction for Dunn: C = sum(t^3 - t) / (12*(N-1))
  tbl <- table(r)
  tie_adj <- sum((tbl^3 - tbl)) / (12 * (N - 1))
  sigma2_base <- N * (N + 1) / 12 - tie_adj
  raw_p <- c()
  pair_ids <- list()
  for (i in 1:(k - 1)) {
    for (j in (i + 1):k) {
      z <- (mean_r[i] - mean_r[j]) / sqrt(sigma2_base * (1 / ns[i] + 1 / ns[j]))
      p <- 2 * pnorm(-abs(z))
      raw_p <- c(raw_p, unname(p))
      pair_ids[[length(pair_ids) + 1]] <- list(i = lvl[i], j = lvl[j])
    }
  }
  # BH adjust
  adj <- p.adjust(raw_p, method = "BH")
  out <- list()
  for (idx in seq_along(pair_ids)) {
    out[[idx]] <- list(
      i = pair_ids[[idx]]$i,
      j = pair_ids[[idx]]$j,
      pAdj = adj[idx]
    )
  }
  out
}

# ── Helpers ────────────────────────────────────────────────────────────────

# Wrap numeric vectors so jsonlite doesn't produce objects.
J <- function(x) {
  if (is.numeric(x) && length(x) > 1) return(as.list(x))
  x
}

results <- list()
add <- function(...) {
  results[[length(results) + 1]] <<- list(...)
}

# ── Dataset bank ───────────────────────────────────────────────────────────
# For each test, we store the inputs (so run.js sees bit-identical data) and
# the R reference values.

# Helper: split a numeric vector by a factor into a named list of numeric
# vectors (the format tools/stats.js operates on).
split_by <- function(values, groups) {
  s <- split(values, groups)
  names(s) <- as.character(levels(as.factor(groups)))
  lapply(s, function(v) unname(v))
}

# ── 1. Shapiro-Wilk ────────────────────────────────────────────────────────

shapiro_cases <- list(
  list(label = "iris Sepal.Length",  x = iris$Sepal.Length),
  list(label = "iris Sepal.Width",   x = iris$Sepal.Width),
  list(label = "iris Petal.Length",  x = iris$Petal.Length),
  list(label = "iris Petal.Width",   x = iris$Petal.Width),
  list(label = "PlantGrowth weight", x = PlantGrowth$weight),
  list(label = "mtcars mpg",         x = mtcars$mpg),
  list(label = "mtcars hp",          x = mtcars$hp),
  list(label = "sleep extra",        x = sleep$extra),
  list(label = "women height",       x = women$height),
  list(label = "trees Height",       x = trees$Height),
  list(label = "airquality Temp",    x = na.omit(airquality$Temp)),
  list(label = "ToothGrowth len",    x = ToothGrowth$len),
  # bimodal → strongly non-normal, tiny W (stress test)
  list(label = "faithful eruptions", x = faithful$eruptions),
  list(label = "faithful waiting",   x = faithful$waiting),
  list(label = "quakes mag",         x = quakes$mag),
  list(label = "USArrests Murder",   x = USArrests$Murder),
  list(label = "swiss Fertility",    x = swiss$Fertility),
  list(label = "morley Speed",       x = morley$Speed),
  list(label = "CO2 uptake",         x = CO2$uptake),
  list(label = "LakeHuron",          x = as.numeric(LakeHuron)),
  list(label = "attitude rating",    x = attitude$rating),
  list(label = "precip",             x = as.numeric(precip))
)

for (c in shapiro_cases) {
  sw <- shapiro.test(c$x)
  add(
    category = "Shapiro-Wilk",
    label    = c$label,
    n        = length(c$x),
    inputs   = list(x = as.list(unname(as.numeric(c$x)))),
    r        = list(
      statistic = unname(sw$statistic),
      p         = unname(sw$p.value)
    )
  )
}

# ── 2. Brown-Forsythe Levene ───────────────────────────────────────────────

cw21 <- ChickWeight[ChickWeight$Time == 21, ]

levene_cases <- list(
  list(label = "iris Sepal.Length by Species",
       values = iris$Sepal.Length, groups = as.character(iris$Species)),
  list(label = "iris Petal.Length by Species",
       values = iris$Petal.Length, groups = as.character(iris$Species)),
  list(label = "PlantGrowth weight by group",
       values = PlantGrowth$weight, groups = as.character(PlantGrowth$group)),
  list(label = "ToothGrowth len by supp",
       values = ToothGrowth$len, groups = as.character(ToothGrowth$supp)),
  list(label = "ToothGrowth len by dose",
       values = ToothGrowth$len, groups = as.character(ToothGrowth$dose)),
  list(label = "chickwts weight by feed",
       values = chickwts$weight, groups = as.character(chickwts$feed)),
  list(label = "InsectSprays count by spray",
       values = InsectSprays$count, groups = as.character(InsectSprays$spray)),
  list(label = "CO2 uptake by Treatment",
       values = CO2$uptake, groups = as.character(CO2$Treatment)),
  list(label = "CO2 uptake by Type",
       values = CO2$uptake, groups = as.character(CO2$Type)),
  list(label = "morley Speed by Expt",
       values = morley$Speed, groups = as.character(morley$Expt)),
  list(label = "ChickWeight@21 weight by Diet",
       values = cw21$weight, groups = as.character(cw21$Diet)),
  list(label = "OrchardSprays decrease by treatment",
       values = OrchardSprays$decrease, groups = as.character(OrchardSprays$treatment))
)

for (c in levene_cases) {
  bf <- brown_forsythe(c$values, c$groups)
  add(
    category = "Levene (Brown-Forsythe)",
    label    = c$label,
    n        = length(c$values),
    inputs   = list(groups = split_by(as.numeric(c$values), c$groups)),
    r        = list(statistic = bf$statistic, p = bf$p)
  )
}

# ── 3. Student & Welch t-tests ─────────────────────────────────────────────

# Helper to subset iris by species
iris_by <- function(col, sp) iris[[col]][iris$Species == sp]

t_cases <- list(
  list(label = "iris Sepal.Length: setosa vs versicolor",
       x = iris_by("Sepal.Length", "setosa"),
       y = iris_by("Sepal.Length", "versicolor"),
       equal = TRUE, kind = "Student t"),
  list(label = "iris Sepal.Length: versicolor vs virginica",
       x = iris_by("Sepal.Length", "versicolor"),
       y = iris_by("Sepal.Length", "virginica"),
       equal = TRUE, kind = "Student t"),
  list(label = "iris Petal.Length: setosa vs versicolor",
       x = iris_by("Petal.Length", "setosa"),
       y = iris_by("Petal.Length", "versicolor"),
       equal = TRUE, kind = "Student t"),
  list(label = "sleep: group 1 vs group 2",
       x = sleep$extra[sleep$group == 1],
       y = sleep$extra[sleep$group == 2],
       equal = TRUE, kind = "Student t"),
  list(label = "ToothGrowth len: OJ vs VC",
       x = ToothGrowth$len[ToothGrowth$supp == "OJ"],
       y = ToothGrowth$len[ToothGrowth$supp == "VC"],
       equal = FALSE, kind = "Welch t"),
  list(label = "mtcars mpg: vs=0 vs vs=1",
       x = mtcars$mpg[mtcars$vs == 0],
       y = mtcars$mpg[mtcars$vs == 1],
       equal = FALSE, kind = "Welch t"),
  list(label = "warpbreaks breaks: wool A vs wool B",
       x = warpbreaks$breaks[warpbreaks$wool == "A"],
       y = warpbreaks$breaks[warpbreaks$wool == "B"],
       equal = FALSE, kind = "Welch t"),
  list(label = "CO2 uptake: Quebec vs Mississippi",
       x = CO2$uptake[CO2$Type == "Quebec"],
       y = CO2$uptake[CO2$Type == "Mississippi"],
       equal = TRUE, kind = "Student t"),
  list(label = "CO2 uptake: nonchilled vs chilled",
       x = CO2$uptake[CO2$Treatment == "nonchilled"],
       y = CO2$uptake[CO2$Treatment == "chilled"],
       equal = FALSE, kind = "Welch t"),
  list(label = "ChickWeight@21: Diet 1 vs Diet 4",
       x = cw21$weight[cw21$Diet == 1],
       y = cw21$weight[cw21$Diet == 4],
       equal = FALSE, kind = "Welch t"),
  list(label = "morley Speed: Expt 1 vs Expt 5",
       x = morley$Speed[morley$Expt == 1],
       y = morley$Speed[morley$Expt == 5],
       equal = TRUE, kind = "Student t"),
  list(label = "swiss Fertility: high vs low Catholic",
       x = swiss$Fertility[swiss$Catholic >= 50],
       y = swiss$Fertility[swiss$Catholic <  50],
       equal = FALSE, kind = "Welch t")
)

for (c in t_cases) {
  tt <- t.test(c$x, c$y, var.equal = c$equal)
  add(
    category = c$kind,
    label    = c$label,
    n        = length(c$x) + length(c$y),
    inputs   = list(
      a = as.list(unname(as.numeric(c$x))),
      b = as.list(unname(as.numeric(c$y)))
    ),
    r        = list(statistic = unname(tt$statistic), p = unname(tt$p.value))
  )
}

# ── 4. Mann-Whitney U ──────────────────────────────────────────────────────

mwu_cases <- list(
  list(label = "ToothGrowth len: dose=0.5 vs dose=2.0",
       x = ToothGrowth$len[ToothGrowth$dose == 0.5],
       y = ToothGrowth$len[ToothGrowth$dose == 2.0]),
  list(label = "mtcars mpg: am=0 vs am=1",
       x = mtcars$mpg[mtcars$am == 0],
       y = mtcars$mpg[mtcars$am == 1]),
  list(label = "InsectSprays: spray A vs spray F",
       x = InsectSprays$count[InsectSprays$spray == "A"],
       y = InsectSprays$count[InsectSprays$spray == "F"]),
  list(label = "CO2 uptake: Quebec vs Mississippi",
       x = CO2$uptake[CO2$Type == "Quebec"],
       y = CO2$uptake[CO2$Type == "Mississippi"]),
  list(label = "ChickWeight@21: Diet 1 vs Diet 3",
       x = cw21$weight[cw21$Diet == 1],
       y = cw21$weight[cw21$Diet == 3]),
  list(label = "OrchardSprays: A vs H",
       x = OrchardSprays$decrease[OrchardSprays$treatment == "A"],
       y = OrchardSprays$decrease[OrchardSprays$treatment == "H"])
)

for (c in mwu_cases) {
  # Normal approximation with continuity correction — matches stats.js
  suppressWarnings({
    w <- wilcox.test(c$x, c$y, exact = FALSE, correct = TRUE)
  })
  add(
    category = "Mann-Whitney U",
    label    = c$label,
    n        = length(c$x) + length(c$y),
    inputs   = list(
      a = as.list(unname(as.numeric(c$x))),
      b = as.list(unname(as.numeric(c$y)))
    ),
    r        = list(statistic = unname(w$statistic), p = unname(w$p.value))
  )
}

# ── 5. one-way ANOVA ───────────────────────────────────────────────────────

anova_cases <- list(
  list(label = "iris Sepal.Length by Species",
       values = iris$Sepal.Length, groups = as.character(iris$Species)),
  list(label = "iris Petal.Length by Species",
       values = iris$Petal.Length, groups = as.character(iris$Species)),
  list(label = "PlantGrowth weight by group",
       values = PlantGrowth$weight, groups = as.character(PlantGrowth$group)),
  list(label = "ToothGrowth len by dose",
       values = ToothGrowth$len, groups = as.character(ToothGrowth$dose)),
  list(label = "CO2 uptake by Treatment",
       values = CO2$uptake, groups = as.character(CO2$Treatment)),
  list(label = "morley Speed by Expt",
       values = morley$Speed, groups = as.character(morley$Expt)),
  list(label = "ChickWeight@21 weight by Diet",
       values = cw21$weight, groups = as.character(cw21$Diet)),
  list(label = "OrchardSprays decrease by treatment",
       values = OrchardSprays$decrease, groups = as.character(OrchardSprays$treatment))
)

for (c in anova_cases) {
  fit <- aov(values ~ groups,
             data = data.frame(values = c$values, groups = c$groups))
  s <- summary(fit)[[1]]
  add(
    category = "one-way ANOVA",
    label    = c$label,
    n        = length(c$values),
    inputs   = list(groups = split_by(as.numeric(c$values), c$groups)),
    r        = list(statistic = unname(s[["F value"]][1]),
                    p         = unname(s[["Pr(>F)"]][1]))
  )
}

# ── 6. Welch ANOVA ─────────────────────────────────────────────────────────

welch_anova_cases <- list(
  list(label = "iris Sepal.Width by Species",
       values = iris$Sepal.Width, groups = as.character(iris$Species)),
  list(label = "chickwts weight by feed",
       values = chickwts$weight, groups = as.character(chickwts$feed)),
  list(label = "InsectSprays count by spray",
       values = InsectSprays$count, groups = as.character(InsectSprays$spray)),
  list(label = "morley Speed by Expt",
       values = morley$Speed, groups = as.character(morley$Expt)),
  list(label = "ChickWeight@21 weight by Diet",
       values = cw21$weight, groups = as.character(cw21$Diet)),
  list(label = "OrchardSprays decrease by treatment",
       values = OrchardSprays$decrease, groups = as.character(OrchardSprays$treatment))
)

for (c in welch_anova_cases) {
  w <- oneway.test(values ~ groups,
                   data = data.frame(values = c$values, groups = c$groups),
                   var.equal = FALSE)
  add(
    category = "Welch ANOVA",
    label    = c$label,
    n        = length(c$values),
    inputs   = list(groups = split_by(as.numeric(c$values), c$groups)),
    r        = list(statistic = unname(w$statistic), p = unname(w$p.value))
  )
}

# ── 7. Kruskal-Wallis ──────────────────────────────────────────────────────

kw_cases <- list(
  list(label = "InsectSprays count by spray",
       values = InsectSprays$count, groups = as.character(InsectSprays$spray)),
  list(label = "chickwts weight by feed",
       values = chickwts$weight, groups = as.character(chickwts$feed)),
  list(label = "PlantGrowth weight by group",
       values = PlantGrowth$weight, groups = as.character(PlantGrowth$group)),
  list(label = "morley Speed by Expt",
       values = morley$Speed, groups = as.character(morley$Expt)),
  list(label = "ChickWeight@21 weight by Diet",
       values = cw21$weight, groups = as.character(cw21$Diet)),
  list(label = "OrchardSprays decrease by treatment",
       values = OrchardSprays$decrease, groups = as.character(OrchardSprays$treatment))
)

for (c in kw_cases) {
  k <- kruskal.test(c$values, as.factor(c$groups))
  add(
    category = "Kruskal-Wallis",
    label    = c$label,
    n        = length(c$values),
    inputs   = list(groups = split_by(as.numeric(c$values), c$groups)),
    r        = list(statistic = unname(k$statistic), p = unname(k$p.value))
  )
}

# ── 8. Tukey HSD (per-pair adjusted p-values) ──────────────────────────────

tukey_cases <- list(
  list(label = "iris Sepal.Length by Species",
       values = iris$Sepal.Length, groups = as.character(iris$Species)),
  list(label = "PlantGrowth weight by group",
       values = PlantGrowth$weight, groups = as.character(PlantGrowth$group)),
  list(label = "ToothGrowth len by dose",
       values = ToothGrowth$len, groups = as.character(ToothGrowth$dose)),
  list(label = "chickwts weight by feed",
       values = chickwts$weight, groups = as.character(chickwts$feed)),
  list(label = "ChickWeight@21 weight by Diet",
       values = cw21$weight, groups = as.character(cw21$Diet)),
  list(label = "morley Speed by Expt",
       values = morley$Speed, groups = as.character(morley$Expt))
)

for (c in tukey_cases) {
  fit <- aov(values ~ groups,
             data = data.frame(values = c$values, groups = c$groups))
  th <- TukeyHSD(fit)$groups
  pairs <- list()
  for (nm in rownames(th)) {
    halves <- strsplit(nm, "-", fixed = TRUE)[[1]]
    # order by levels so it matches JS output regardless of factor order
    pairs[[length(pairs) + 1]] <- list(
      i = halves[2], j = halves[1], pAdj = unname(th[nm, "p adj"])
    )
  }
  add(
    category = "Tukey HSD",
    label    = c$label,
    n        = length(c$values),
    inputs   = list(groups = split_by(as.numeric(c$values), c$groups)),
    r        = list(pairs = pairs)
  )
}

# ── 9. Games-Howell ────────────────────────────────────────────────────────

gh_cases <- list(
  list(label = "iris Sepal.Width by Species",
       values = iris$Sepal.Width, groups = as.character(iris$Species)),
  list(label = "chickwts weight by feed",
       values = chickwts$weight, groups = as.character(chickwts$feed)),
  list(label = "ChickWeight@21 weight by Diet",
       values = cw21$weight, groups = as.character(cw21$Diet)),
  list(label = "morley Speed by Expt",
       values = morley$Speed, groups = as.character(morley$Expt))
)

for (c in gh_cases) {
  gh <- games_howell(c$values, c$groups)
  add(
    category = "Games-Howell",
    label    = c$label,
    n        = length(c$values),
    inputs   = list(groups = split_by(as.numeric(c$values), c$groups)),
    r        = list(pairs = gh)
  )
}

# ── 10. Dunn (BH) ──────────────────────────────────────────────────────────

dunn_cases <- list(
  list(label = "InsectSprays count by spray",
       values = InsectSprays$count, groups = as.character(InsectSprays$spray)),
  list(label = "PlantGrowth weight by group",
       values = PlantGrowth$weight, groups = as.character(PlantGrowth$group)),
  list(label = "chickwts weight by feed",
       values = chickwts$weight, groups = as.character(chickwts$feed)),
  list(label = "ChickWeight@21 weight by Diet",
       values = cw21$weight, groups = as.character(cw21$Diet)),
  list(label = "OrchardSprays decrease by treatment",
       values = OrchardSprays$decrease, groups = as.character(OrchardSprays$treatment))
)

for (c in dunn_cases) {
  d <- dunn_bh(c$values, c$groups)
  add(
    category = "Dunn (BH)",
    label    = c$label,
    n        = length(c$values),
    inputs   = list(groups = split_by(as.numeric(c$values), c$groups)),
    r        = list(pairs = d)
  )
}

# ── 10. Pairwise distance + hierarchical clustering ───────────────────────
# Cross-checks the heatmap tool's clustering primitives against R's dist() and
# hclust(). A random 100 × 15 matrix (fixed seed) is big enough to shake out
# off-by-one bugs without bloating results-r.json. Distances and heights are
# compared after sorting each vector — sort() is robust to tie-handling
# differences between implementations while still catching any real bug.

set.seed(20260419)
clust_matrix <- matrix(rnorm(100 * 15), nrow = 100, ncol = 15)
clust_inputs <- list(
  matrix = lapply(seq_len(nrow(clust_matrix)), function(i) as.list(clust_matrix[i, ]))
)

dist_methods <- list(
  list(toolbox = "euclidean", r = "euclidean"),
  list(toolbox = "manhattan", r = "manhattan")
)

for (dm in dist_methods) {
  d <- dist(clust_matrix, method = dm$r)
  add(
    category = "pairwise distance",
    label    = paste0("100x15 Gaussian · ", dm$toolbox),
    n        = nrow(clust_matrix),
    inputs   = c(clust_inputs, list(metric = dm$toolbox)),
    r        = list(sorted = as.list(sort(as.vector(d))))
  )
}

# Correlation distance: 1 - Pearson r on the rows.
cor_d <- as.dist(1 - cor(t(clust_matrix)))
add(
  category = "pairwise distance",
  label    = "100x15 Gaussian · correlation",
  n        = nrow(clust_matrix),
  inputs   = c(clust_inputs, list(metric = "correlation")),
  r        = list(sorted = as.list(sort(as.vector(cor_d))))
)

# Hierarchical clustering heights, one case per distance × linkage combo.
hclust_combos <- list(
  list(distance = "euclidean", linkage = "average",  rLink = "average"),
  list(distance = "euclidean", linkage = "complete", rLink = "complete"),
  list(distance = "euclidean", linkage = "single",   rLink = "single"),
  list(distance = "manhattan", linkage = "average",  rLink = "average"),
  list(distance = "correlation", linkage = "average", rLink = "average")
)

for (hc in hclust_combos) {
  if (hc$distance == "correlation") {
    d_obj <- as.dist(1 - cor(t(clust_matrix)))
  } else {
    d_obj <- dist(clust_matrix, method = hc$distance)
  }
  h <- hclust(d_obj, method = hc$rLink)
  add(
    category = "hclust heights",
    label    = paste0("100x15 · ", hc$distance, " · ", hc$linkage),
    n        = nrow(clust_matrix),
    inputs   = c(clust_inputs,
                 list(metric = hc$distance, linkage = hc$linkage)),
    r        = list(sorted = as.list(sort(h$height)))
  )
}

# ── Write out ──────────────────────────────────────────────────────────────

out <- list(
  meta = list(
    r_version = R.version.string,
    generated = format(Sys.time(), tz = "UTC", usetz = TRUE),
    n_tests   = length(results)
  ),
  tests = results
)

out_path <- file.path("benchmark", "results-r.json")
write_json(out, out_path, auto_unbox = TRUE, pretty = TRUE, digits = 10,
           null = "null", na = "null")

cat(sprintf("wrote %d test specs to %s\n", length(results), out_path))
