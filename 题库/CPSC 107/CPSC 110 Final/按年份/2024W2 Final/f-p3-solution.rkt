;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2024w2-f/f-p3) ;Do not edit or remove this tag

(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line

(@htdf n-skip-odd-skip)
(@signature Natural (listof Natural) -> (listof Natural))
;; produce list of every n skip or x skip if odd x in (listof Natural)
(check-expect (n-skip-odd-skip 5 empty) empty)
(check-expect (n-skip-odd-skip 2 (list 2 2 4 6 8 6)) (list 4 6))
(check-expect (n-skip-odd-skip 2 (list 2 2 4 6 8 1 2 8)) (list 4 1 8))
(check-expect (n-skip-odd-skip 2 (list 1 2 3 4 5 6 1 8 9)) (list 3 1 9))
(check-expect (n-skip-odd-skip 3 (list 0 1 2 4 4 5 6 5 8 9 10 11 12 7 8))
              (list 4 5 7))
(check-expect (n-skip-odd-skip 3 (list 0 1 2 3 4 5 6 2 8 9 1 11 12 7 8))
              (list 3 2 1 11))
              

;(define (n-skip-odd-skip n lon) empty)

(@template-origin (listof Natural) accumulator)

(define (n-skip-odd-skip n lon0)
  ;; to-skip is Natural; number of elements of lon to skip before next pick
  (local [(define (fn-for-lon lon to-skip)
            (cond [(empty? lon) empty]
                  [else
                   (if (zero? to-skip)
                       (cons (first lon)
                             (fn-for-lon (rest lon)
                                         (if (odd? (first lon))
                                             (first lon)
                                             n)))
                       (fn-for-lon (rest lon) (sub1 to-skip)))]))]

    (fn-for-lon lon0 n)))
