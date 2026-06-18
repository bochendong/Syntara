;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p3-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2024w1-f/f-p3) ;Do not edit or remove this tag



(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line




(@htdf skip-da-dee-do)
(@signature (listof X) -> (listof X))
;; take 1, skip 0, take 1, skip 1, take 1, skip 2, take 1, skip 3...
(check-expect (skip-da-dee-do (list)) (list))
(check-expect (skip-da-dee-do (list 0 1 2 3 4 5 6 7 8 9 10 11 12))
              (list 0 1 3 6 10))
(check-expect (skip-da-dee-do (list "a" "b" "c" "d" "e" "f"))
              (list "a" "b" "d"))


(@template-origin (listof X) accumulator)

(define (skip-da-dee-do lox0)
  ;; to-skip is Natural;   number of elements of lox to skip before next take
  ;; next-skip is Natural; initial value of to-skip after next take
  (local [(define (fn-for-lox lox to-skip next-skip)
            (cond [(empty? lox) empty]
                  [else
                   (if (zero? to-skip)
                       (cons (first lox)
                             (fn-for-lox (rest lox) next-skip (add1 next-skip)))
                       (fn-for-lox (rest lox) (sub1 to-skip) next-skip))]))]
    (fn-for-lox lox0 0 0)))
