;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname 2020w1-f-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2020w1-f/f-p1)

(@cwl ???)   ;fill in your CWL here (same CWL you put for 110 problem sets)


(@problem 1) ;DO NOT EDIT OR DELETE THIS LINE!


(define ARROW-A "MR")
(define ARROW-B "MR")
(define ARROW-C "R")
(define ARROW-D "MR")
(define ARROW-E "R")
(define ARROW-F "MR")
(define ARROW-G "MR")
(define ARROW-H "MR")
(define ARROW-I "SR")

(define ARROW-1 "NMR")
(define ARROW-2 "NMR")
(define ARROW-3 "NH")
(define ARROW-4 "NMR")
(define ARROW-5 "NH")
(define ARROW-6 "NMR")
(define ARROW-7 "NMR")
(define ARROW-8 "NMR")
(define ARROW-9 "NR")



;;============================================================================
;;============================================================================
;;============================================================================
;; You should ignore this code.  Do not read or edit below here.
;;
;; This code is here so that running the file will verify that your answer is
;; well-formed.

(define (is-string-R-SR-MR-NH-NR-OR-NMR x)
  (member x '("R" "SR" "MR" "NH" "NR" "NMR")))

(define (is-string-yes-or-no x)
  (member x '("yes" "no")))


(check-satisfied ARROW-A is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-B is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-C is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-D is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-E is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-F is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-G is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-H is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-I is-string-R-SR-MR-NH-NR-OR-NMR)

(check-satisfied ARROW-1 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-2 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-3 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-4 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-5 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-6 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-7 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-8 is-string-R-SR-MR-NH-NR-OR-NMR)
(check-satisfied ARROW-9 is-string-R-SR-MR-NH-NR-OR-NMR)



