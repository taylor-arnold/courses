library(tidyverse)

f1 <- dir("copy")
f2 <- dir("write")

f <- c(file.path("copy", f1), file.path("write", f2))
task <- rep(c("copy", "write"), c(length(f1), length(f2)))

df <- vector("list", length(f))
for (i in seq_along(df)) {
  x <- read_csv(f[j], na="NA")
  x$id <- i
}