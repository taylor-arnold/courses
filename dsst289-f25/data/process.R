library(tidyverse)

f1 <- dir("copy")
f2 <- dir("write")

f <- c(file.path("copy", f1), file.path("write", f2))
task <- rep(c("copy", "write"), c(length(f1), length(f2)))

df <- vector("list", length(f))
for (j in seq_along(df)) {
  x <- read_csv(f[j], na="NA")
  x$id <- j
  x$task <- task[j]
  x <- select(x, id, task, everything())
  df[[j]] <- x
}
df <- bind_rows(df)
df$key[df$key_code=="Space"] <- " "

write_csv(df, "keylog_class.csv.bz2")