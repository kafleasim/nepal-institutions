# Second pass at the power layer: candidates aimed at Khan's (2010) horizontal and
# vertical dimensions and at unipolar vs multipolar authority, which the first pass
# (build_proxy_data.R) covered weakly.
#
# What is new relative to build_proxy_data.R:
#   - Targets. Besides x_horizontalpower and x_verticalpower, three item-level
#     targets that sit closer to the concepts than the composite indices do:
#       q8_hierarchy_lb       high-level leaders vs intermediate leaders and
#                             followers within the leader's bloc — Khan's vertical
#                             dimension almost verbatim
#       unipolar              mean of z(q14_polmakingconcent), z(q15_polimplemconcent):
#                             can the leader make and implement policy without
#                             bargaining with other power centres
#       threat_breadth        number of the seven domestic actor types posing at
#                             least a moderate political threat to the leader (q18):
#                             how many independent challengers the leader faces
#   - Candidates. V-Dem election outcomes (carried forward between elections),
#     coups, territorial control, the regime-group "pivot" variables, bodies able
#     to remove the head of state, party candidate-selection centralisation,
#     subnational power; plus non-V-Dem series from the GL macro panel: Henisz
#     POLCON, Chisols/GWF regime type, WhoGov tenure, UCDP conflict, Hadenius-
#     Teorell largest-party size.
#
# Writes khan_panel.rds (country-period, labelled) and khan_global.rds
# (country-year, all countries) for khan_evaluate.R.

suppressMessages({ library(tidyverse); library(arrow); library(haven); library(jsonlite) })
setwd("/home/taimur/dev/institutional-complexity/analyses/polsett-proxies")

PSD   <- "~/dev/shared-data/polsett/psd_main_aggregated_v1.dta"
VDEM  <- "~/dev/shared-data/vdem/vdem.parquet"
MACRO <- "~/dev/shared-data/growth-lab/glmacro_master_alldata.parquet"

# ---------------------------------------------------------------------------
# 1. Targets at the country-period level
# ---------------------------------------------------------------------------

THREAT_DOM <- paste0("q18_polthreat_", c("ruralsub", "ruraldom", "urbansub", "urbandom",
                                         "ethnoregrel", "exileoppos", "military"))
ITEMS <- c("q2_power_lb", "q2_power_clb", "q2_power_ob", "q3_clbsplit", "q8_hierarchy_lb",
           "q9_cohesiveness_lb", "q14_polmakingconcent", "q15_polimplemconcent", THREAT_DOM)
TGT_RAW <- c("x_horizontalpower", "x_verticalpower", "x_powerconcentration_mix",
             "x_horizontalpowerdummy", "x_verticalpowerdummy", "x_khansettlementype",
             "x_esidettlementype")

psd <- read_dta(PSD) %>%
  transmute(cname_psd, cname_vdem, year = as.integer(year), period = as.integer(periodnumber),
            leader = leadername_nonumber, across(all_of(c(TGT_RAW, ITEMS)), as.numeric))

zs <- function(x) (x - mean(x, na.rm = TRUE)) / sd(x, na.rm = TRUE)

periods <- psd %>%
  group_by(cname_psd, cname_vdem, period) %>%
  summarise(y0 = min(year), y1 = max(year), leader = first(na.omit(leader)),
            across(all_of(c(TGT_RAW, ITEMS)), ~ mean(.x, na.rm = TRUE)), .groups = "drop") %>%
  mutate(across(where(is.numeric), ~ ifelse(is.finite(.x), .x, NA_real_)),
         across(c(x_khansettlementype, x_esidettlementype, x_horizontalpowerdummy,
                  x_verticalpowerdummy), round)) %>%
  filter(!is.na(cname_vdem))

periods <- periods %>%
  mutate(
    unipolar = (zs(q14_polmakingconcent) + zs(q15_polimplemconcent)) / 2,
    # 2.5 on the 1-4 scale = the coder mean sits between "low" and "moderate"
    threat_breadth = rowSums(across(all_of(THREAT_DOM), ~ .x >= 2.5), na.rm = TRUE),
    threat_breadth = ifelse(rowSums(!is.na(across(all_of(THREAT_DOM)))) == 0, NA, threat_breadth),
    # Khan's "elites vs organised non-elites" reading: threat from subordinate
    # classes minus threat from dominant classes
    subord_threat = (q18_polthreat_ruralsub + q18_polthreat_urbansub) / 2 -
                    (q18_polthreat_ruraldom + q18_polthreat_urbandom) / 2
  )
message("PolSett periods: ", nrow(periods), " · countries: ", n_distinct(periods$cname_psd))

# ---------------------------------------------------------------------------
# 2. V-Dem year-level candidates
# ---------------------------------------------------------------------------

ELECT <- c("v2ellostsl", "v2ellostss", "v2ellovtlg", "v2ellovtsm", "v2elvotlrg", "v2elvotsml",
           "v2elboycot", "v2elaccept", "v2eltvrexo")
VD_RAW <- c("e_pt_coup", "e_pt_coup_attempts", "v2svstterr", "v2regpower", "v2regimpgroup",
            "v2regimpoppgroup", "v2regantireg", "v2regdur", "v2regidnr", "v2exnamhos",
            "v2pscnslnl", "v2pssunpar", "v2pscomprg", "v2psprbrch", "v2cscnsult", "v2dlconslt",
            "v2x_feduni", "v2xel_regelec", "v2elrgpwr", "v2ellocpwr", "v2x_divparctrl",
            "v2juhcind", "v2juhccomp", "v2exrescon", "v2lginvstp", "v2exdfdshs", "v2exdfvths",
            "v2clrgunev", "v2clsnlpct", "v2cagenmob", "v2caconmob", "v2exl_legitlead",
            "v2exl_legitperf", "v2x_ex_party", "v2x_ex_military", "v2x_ex_hereditary",
            "v2x_ex_direlect", "v2psnatpar", "v2lgoppart", "v2elmulpar",
            paste0("v2exrmhsol_", 0:7), paste0("v2exctlhg_", 0:8),
            paste0("v2regsupgroups_", 0:13), paste0("v2regoppgroupsact_", 0:13))

vd <- read_parquet(VDEM, col_select = all_of(c("country_name", "country_text_id", "year", ELECT, VD_RAW))) %>%
  filter(year >= 1940) %>% mutate(year = as.integer(year)) %>% arrange(country_name, year)

# Election variables are coded only in election years. Carry each forward until
# the next election, but no more than 10 years, so a suspended legislature does
# not inherit a decades-old result.
locf_capped <- function(x, yr, cap = 10) {
  last_v <- NA_real_; last_y <- NA_integer_
  out <- x
  for (i in seq_along(x)) {
    if (!is.na(x[i])) { last_v <- x[i]; last_y <- yr[i] }
    else if (!is.na(last_y) && yr[i] - last_y <= cap) out[i] <- last_v
  }
  out
}
# Rolling sum over the current and previous k-1 years.
roll_sum <- function(x, k = 10) {
  x0 <- replace(x, is.na(x), 0)
  cs <- cumsum(x0)
  cs - lag(cs, k, default = 0)
}

GROUP <- c("aristocracy", "agrarian", "party", "business", "civilserv", "military", "ethnic",
           "religious", "local", "urbwork", "urbmid", "rurwork", "rurmid", "foreign")

sup_m <- as.matrix(vd[paste0("v2regsupgroups_", 0:13)])
opp_m <- as.matrix(vd[paste0("v2regoppgroupsact_", 0:13)])
pick_group <- function(m, g) ifelse(is.na(g), NA_real_, m[cbind(seq_len(nrow(m)), pmin(pmax(g, 0), 13) + 1)])

vd <- vd %>%
  mutate(
    # The group "most important for the regime's chances of staying in power",
    # and whether it sits inside the support coalition or in active opposition.
    # A pivot group in opposition is the clearest V-Dem image of Khan's strong
    # excluded factions.
    pivot_in_support = pick_group(sup_m, v2regpower),
    pivot_in_opp     = pick_group(opp_m, v2regpower),
    pivot_balance    = pivot_in_support - pivot_in_opp,
    regpower_military = as.numeric(v2regpower == 5),
    regpower_party    = as.numeric(v2regpower == 2),
    regpower_ethnic   = as.numeric(v2regpower %in% c(6, 7)),
    regpower_mass     = as.numeric(v2regpower %in% 9:12),
    regimp_military   = as.numeric(v2regimpgroup == 5),
    regimp_party      = as.numeric(v2regimpgroup == 2),
    regimp_local      = as.numeric(v2regimpgroup == 8),
    oppimp_military   = as.numeric(v2regimpoppgroup == 5),
    oppimp_ethnic     = as.numeric(v2regimpoppgroup %in% c(6, 7)),
    oppimp_mass       = as.numeric(v2regimpoppgroup %in% 9:12),
    # Bodies that could remove the head of state short of force. "None" is the
    # unipolar end; the count is a rough number of veto poles.
    hos_unremovable  = v2exrmhsol_0,
    hos_removers     = rowSums(across(paste0("v2exrmhsol_", 1:7))),
    hog_noapproval   = v2exctlhg_0,
    hog_approvers    = rowSums(across(paste0("v2exctlhg_", c(1:4, 6:8)))),
    hog_needs_party  = v2exctlhg_2,
    hog_needs_mil    = v2exctlhg_4,
    terr_uncontrolled = 100 - v2svstterr,
    sup_count = rowSums(sup_m >= 0.5, na.rm = TRUE),
    opp_count = rowSums(opp_m >= 0.5, na.rm = TRUE)
  ) %>%
  group_by(country_name) %>%
  mutate(
    across(all_of(ELECT), ~ locf_capped(.x, year), .names = "{.col}_f"),
    seat_lead = v2ellostsl_f,
    seat_gap  = v2ellostsl_f - v2ellostss_f,
    vote_gap  = v2ellovtlg_f - v2ellovtsm_f,
    pres_gap  = v2elvotlrg_f - v2elvotsml_f,
    elect_boycott = -v2elboycot_f,
    elect_accept  = v2elaccept_f,
    coup_att_10y = roll_sum(e_pt_coup_attempts, 10),
    coup_succ_10y = roll_sum(e_pt_coup, 10),
    # Executive turnover at elections (v2eltvrexo == 2: the executive changed
    # hands to the opposition), counted over 20 years: the direct record of
    # excluded factions winning power through the ballot.
    elect_turnover_20y = roll_sum(as.numeric(v2eltvrexo == 2), 20),
    # Head-of-state tenure from the name series: consecutive years with the same
    # name. Turnover count over the previous 10 years as an instability measure.
    hos_change = as.numeric(!is.na(v2exnamhos) & v2exnamhos != lag(v2exnamhos)),
    hos_spell  = cumsum(replace(hos_change, is.na(hos_change), 0)),
    hos_changes_10y = roll_sum(hos_change, 10),
    regime_years = v2regdur / 365.25
  ) %>%
  group_by(country_name, hos_spell) %>%
  mutate(hos_tenure = row_number()) %>%
  ungroup()

# ---------------------------------------------------------------------------
# 3. Macro-panel (QoG-sourced) candidates
# ---------------------------------------------------------------------------

MAC_RAW <- c("qog_h_polcon3", "qog_h_polcon5", "qog_h_f", "qog_h_j", "qog_h_lflo", "qog_h_alignl1",
             "qog_gwf_regimetype", "qog_chisols_per", "qog_chisols_mil", "qog_chisols_warlord",
             "qog_wgov_leadexp", "qog_wgov_tret", "qog_wgov_minmil", "qog_br_coup",
             "qog_ucdp_type3", "qog_ucdp_type4", "qog_ht_partsz", "qog_iaep_evp", "qog_fe_etfra")
mac <- read_parquet(MACRO, col_select = all_of(c("countrycodeiso", "year", MAC_RAW))) %>%
  mutate(year = as.integer(year)) %>%
  rename(country_text_id = countrycodeiso) %>%
  mutate(
    # Chisols codes non-autocracies -9: they are not personalist/military regimes.
    across(c(qog_chisols_per, qog_chisols_mil, qog_chisols_warlord), ~ ifelse(.x < 0, 0, .x)),
    # GWF covers autocracies to 2010; outside that set the type dummies are 0.
    # Codes checked against known cases (SAU 1, UGA/PHL-Marcos 2, BRA-1975 3,
    # CHN/MEX 4); mixed types left out because their labels are not documented here.
    gwf_personal = ifelse(year <= 2010, as.numeric(qog_gwf_regimetype %in% 2), NA),
    gwf_military = ifelse(year <= 2010, as.numeric(qog_gwf_regimetype %in% 3), NA),
    gwf_party    = ifelse(year <= 2010, as.numeric(qog_gwf_regimetype %in% 4), NA),
    # UCDP lists conflict years only; absence means no conflict.
    across(c(qog_ucdp_type3, qog_ucdp_type4), ~ ifelse(year <= 2021, replace_na(.x, 0), NA)),
    # Type 3 only: QoG codes UCDP by participant, so type 4 (internationalised)
    # marks Germany, the UK and the US for deployments abroad.
    ucdp_internal = qog_ucdp_type3
  ) %>%
  select(-qog_gwf_regimetype, -qog_ucdp_type3, -qog_ucdp_type4)

# ---------------------------------------------------------------------------
# 4. Candidate registry
# ---------------------------------------------------------------------------
# `concept`: H horizontal, V vertical, U unipolar(+)/multipolar(-). `dir` is the
# prior sign against the PolSett orientation (high horizontal power, high vertical
# power, high unipolarity).

NEW <- tribble(
  ~key,               ~source, ~concept, ~dir, ~label,
  "seat_lead",        "vdem",  "H",  1, "Largest party's lower-chamber seat share",
  "seat_gap",         "vdem",  "H",  1, "Seat share gap, largest minus second party",
  "vote_gap",         "vdem",  "H",  1, "Vote share gap, largest minus second party",
  "pres_gap",         "vdem",  "H",  1, "Presidential vote gap, winner minus runner-up",
  "elect_boycott",    "vdem",  "H", -1, "Election boycotts (high = widespread)",
  "elect_accept",     "vdem",  "H",  1, "Losers accept election results",
  "coup_att_10y",     "vdem",  "H", -1, "Coup attempts, trailing 10 years (Powell-Thyne)",
  "coup_succ_10y",    "vdem",  "H", -1, "Successful coups, trailing 10 years",
  "elect_turnover_20y","vdem", "H", -1, "Electoral executive turnovers, trailing 20 years",
  "terr_uncontrolled","vdem",  "H", -1, "Territory outside state control (%)",
  "pivot_in_support", "vdem",  "H",  1, "Pivotal group is a regime supporter",
  "pivot_in_opp",     "vdem",  "H", -1, "Pivotal group is in active opposition",
  "pivot_balance",    "vdem",  "H",  1, "Pivotal group: support minus opposition",
  "regpower_military","vdem",  "H", -1, "Pivotal group is the military",
  "regpower_mass",    "vdem",  "H", -1, "Pivotal group is a mass class",
  "regpower_ethnic",  "vdem",  "H", -1, "Pivotal group is ethnic/religious",
  "oppimp_military",  "vdem",  "H", -1, "Main opposition group is the military",
  "oppimp_ethnic",    "vdem",  "H", -1, "Main opposition group is ethnic/religious",
  "oppimp_mass",      "vdem",  "H", -1, "Main opposition group is a mass class",
  "opp_count",        "vdem",  "H", -1, "Active opposition groups named (count)",
  "v2cagenmob",       "vdem",  "H", -1, "Mass mobilization",
  "v2elmulpar",       "vdem",  "H", -1, "Elections multiparty",
  "qog_br_coup",      "macro", "H", -1, "Coups (Bjørnskov-Rode)",
  "ucdp_internal",    "macro", "H", -1, "Internal armed conflict (UCDP)",
  "qog_ht_partsz",    "macro", "H",  1, "Largest party size (Hadenius-Teorell)",
  "v2pscnslnl",       "vdem",  "V", -1, "Candidate selection decentralised (high = local)",
  "v2pssunpar",       "vdem",  "V", -1, "Subnational party control varies",
  "v2pscomprg",       "vdem",  "V", -1, "Parties competitive across regions",
  "v2psprbrch",       "vdem",  "V", -1, "Party local branches",
  "v2cscnsult",       "vdem",  "V", -1, "CSOs consulted by policymakers",
  "v2dlconslt",       "vdem",  "V", -1, "Range of consultation",
  "regimp_party",     "vdem",  "V", -1, "Regime's main support group is the party",
  "regimp_military",  "vdem",  "V", -1, "Regime's main support group is the military",
  "regimp_local",     "vdem",  "V", -1, "Regime's main support group is local elites",
  "hog_needs_party",  "vdem",  "V", -1, "HOG seeks ruling-party approval",
  "hog_needs_mil",    "vdem",  "V", -1, "HOG seeks military approval",
  "v2exl_legitlead",  "vdem",  "V",  1, "Legitimation by person of the leader",
  "v2x_ex_party",     "vdem",  "V", -1, "Executive selected by party",
  "v2x_ex_military",  "vdem",  "V", -1, "Executive selected by military",
  "hos_tenure",       "vdem",  "V",  1, "Head-of-state tenure (years)",
  "hos_changes_10y",  "vdem",  "V", -1, "HOS changes, trailing 10 years",
  "regime_years",     "vdem",  "V",  1, "Regime duration (years)",
  "sup_count",        "vdem",  "V", -1, "Support groups named (count)",
  "qog_chisols_per",  "macro", "V",  1, "Personalist regime (Chisols)",
  "qog_chisols_mil",  "macro", "V", -1, "Military regime (Chisols)",
  "gwf_personal",     "macro", "V",  1, "Personalist regime (GWF)",
  "gwf_party",        "macro", "V", -1, "Party regime (GWF)",
  "gwf_military",     "macro", "V", -1, "Military regime (GWF)",
  "qog_wgov_leadexp", "macro", "V",  1, "Leader experience/tenure (WhoGov)",
  "qog_wgov_tret",    "macro", "V",  1, "Cabinet retention (WhoGov)",
  "qog_wgov_minmil",  "macro", "V", -1, "Military ministers (WhoGov)",
  "hos_unremovable",  "vdem",  "U",  1, "No body could remove the HOS",
  "hos_removers",     "vdem",  "U", -1, "Bodies able to remove the HOS (count)",
  "hog_noapproval",   "vdem",  "U",  1, "HOG seeks approval from no body",
  "hog_approvers",    "vdem",  "U", -1, "Bodies HOG seeks approval from (count)",
  "v2x_feduni",       "vdem",  "U", -1, "Division of power index (federalism)",
  "v2xel_regelec",    "vdem",  "U", -1, "Regional government elected",
  "v2elrgpwr",        "vdem",  "U", -1, "Regional offices' relative power",
  "v2ellocpwr",       "vdem",  "U", -1, "Local offices' relative power",
  "v2x_divparctrl",   "vdem",  "U", -1, "Divided party control",
  "v2juhcind",        "vdem",  "U", -1, "High court independence",
  "v2juhccomp",       "vdem",  "U", -1, "Compliance with high court",
  "v2exrescon",       "vdem",  "U", -1, "Executive respects constitution",
  "v2lginvstp",       "vdem",  "U", -1, "Legislature investigates executive",
  "v2exdfdshs",       "vdem",  "U",  1, "HOS can dissolve legislature",
  "v2exdfvths",       "vdem",  "U",  1, "HOS veto power",
  "v2clrgunev",       "vdem",  "U", -1, "Civil liberties uniform across regions",
  "v2clsnlpct",       "vdem",  "U", -1, "Population in weak-rights subnational areas",
  "v2psnatpar",       "vdem",  "U",  1, "National party control",
  "v2lgoppart",       "vdem",  "U", -1, "Legislature opposition parties",
  "qog_h_polcon3",    "macro", "U", -1, "Political constraints (POLCON III)",
  "qog_h_polcon5",    "macro", "U", -1, "Political constraints (POLCON V)",
  "qog_h_f",          "macro", "U", -1, "Independent sub-federal units (Henisz)",
  "qog_h_j",          "macro", "U", -1, "Independent judiciary (Henisz)",
  "qog_h_lflo",       "macro", "U", -1, "Legislative fractionalisation (Henisz)",
  "qog_h_alignl1",    "macro", "U",  1, "Executive-legislature alignment (Henisz)",
  "qog_iaep_evp",     "macro", "U",  1, "Executive veto power (IAEP)",
  "qog_chisols_warlord","macro","U", -1, "Warlord regime (Chisols)",
  "qog_fe_etfra",     "macro", "U", -1, "Ethnic fractionalisation (Fearon)"
)

year_level <- vd %>%
  left_join(mac, by = c("country_text_id", "year")) %>%
  select(country_name, country_text_id, year, all_of(NEW$key))

# ---------------------------------------------------------------------------
# 5. Collapse to periods and join the first-pass candidates
# ---------------------------------------------------------------------------

by_period <- periods %>%
  select(cname_psd, cname_vdem, period, y0, y1) %>%
  inner_join(year_level, by = c("cname_vdem" = "country_name"), relationship = "many-to-many") %>%
  filter(year >= y0, year <= y1) %>%
  group_by(cname_psd, period) %>%
  summarise(iso3 = first(country_text_id),
            across(all_of(NEW$key), ~ mean(.x, na.rm = TRUE)), .groups = "drop") %>%
  mutate(across(all_of(NEW$key), ~ ifelse(is.finite(.x), .x, NA_real_)))

# First-pass candidates, so the evaluation can compare old pool against old+new.
txt <- readLines("proxy_data.js", warn = FALSE)
D <- fromJSON(sub(";$", "", sub("^window\\.PROXY_DATA = ", "", paste(txt, collapse = "\n"))))
old_cands <- as_tibble(D$candidates) %>%
  filter(concept %in% c("pc_horiz", "pc_vert", "pc", "sf_coopt", "sf_powerful", "other")) %>%
  filter(!key %in% NEW$key)
old <- as_tibble(D$periods) %>%
  select(country, y0, y1, any_of(old_cands$key))

panel <- periods %>%
  inner_join(by_period, by = c("cname_psd", "period")) %>%
  left_join(old, by = c("cname_psd" = "country", "y0", "y1"))

message("Labelled panel: ", nrow(panel), " periods · ", n_distinct(panel$cname_psd), " countries · ",
        sum(!is.na(panel$v2x_civlib)), " matched to first-pass candidates")

registry <- bind_rows(
  NEW %>% mutate(pool = "new"),
  old_cands %>% transmute(key, source, concept = recode(concept, pc_horiz = "H", pc_vert = "V"),
                          dir, label, pool = "old")
)

saveRDS(list(panel = panel, registry = registry), "khan_panel.rds")
saveRDS(year_level %>%
          left_join(read_parquet(VDEM, col_select = all_of(c("country_name", "year", old_cands$key[old_cands$key %in% names(open_dataset(VDEM)$schema)]))) %>%
                      mutate(year = as.integer(year)), by = c("country_name", "year")) %>%
          filter(year >= 1960),
        "khan_global.rds")
message("Wrote khan_panel.rds, khan_global.rds")
