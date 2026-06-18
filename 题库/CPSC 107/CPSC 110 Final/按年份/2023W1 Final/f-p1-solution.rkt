;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
;; DO NOT PUT ANYTHING PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
(require spd/tags)

(@assignment exams/2023w1-f/f-p1) ;Do not edit or remove this tag

(@cwl ???) ;fill in your CWL here (same as for problem sets)

(@problem 1) ;do not edit or delete this line


(@htdf sum-between)
(@signature Number Number (listof Number) -> Number)
;; produce the sum of those numbers within [lo, hi]
;; CONSTRAINT: lo is < hi
(check-expect (sum-between 1 3 (list 2)) 2)
(check-expect (sum-between 4 6 (list 2 4 1 3 5 6)) (+ 4 5 6))

;(define (sum-between lo hi lon) 0)

(@template-origin fn-composition use-abstract-fn)

(define (sum-between lo hi lon)
  (foldr + 0
         (filter (lambda (n) (<= lo n hi))
                 lon)))

