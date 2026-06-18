;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname f-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)


(@assignment exams/2020W2-F/f-p1)

(@cwl ???)   ;fill in your CWL here (same CWL you put for problem sets)

(@problem 1) ;DO NOT EDIT OR DELETE THIS LINE!

(@htdf foo)

(@signature ((listof X) -> Boolean) (X -> Y) (listof X) (listof Y) -> (listof Y))

(define (foo a b c d)
  (cond [(a c) d]
        [else
         (cons (b (first c))
               (foo a b (rest c) d))]))


