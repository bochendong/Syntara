#lang racket

(require spd-grader/grader
         spd-grader/mcq)

(provide grader)

(define grader
  (lambda ()
    (grade-submission
      (grade-problem 1
        (grade-mcq
          (equal? ARROW-A "MR")
          (equal? ARROW-B "MR")
          (equal? ARROW-C "R")
          (equal? ARROW-D "MR")
          (equal? ARROW-E "R")
          (equal? ARROW-F "MR")
          (equal? ARROW-G "MR")
          (equal? ARROW-H "MR")
          (equal? ARROW-I "SR")
          
          (equal? ARROW-1 "NMR")
          (equal? ARROW-2 "NMR")
          (equal? ARROW-3 "NH")
          (equal? ARROW-4 "NMR")
          (equal? ARROW-5 "NH")
          (equal? ARROW-6 "NMR")
          (equal? ARROW-7 "NMR")
          (equal? ARROW-8 "NMR")
          (equal? ARROW-9 "NR"))))))
