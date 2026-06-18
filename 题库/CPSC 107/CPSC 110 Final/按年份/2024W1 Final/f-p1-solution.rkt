;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-reader.ss" "lang")((modname f-p1-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2024w1-f/f-p1) ;Do not edit or remove this tag



(@problem 1) ;do not edit or delete this line

;;
;; Given the following definition:
;;


(define A (+ 1 2))
(define B (+ A 3))

(define (foo a b)
  (local [(define (bar x a)
            (list (+ a x)
                  (+ B b)
                  C))
          (define C (+ a b))]
    (bar 4 5)))


(foo 1 B)
  
;; write JUST THE LIFTED DEFINITIONS BELOW HERE

(define (bar_0 x a)
  (list (+ a x)
        (+ B 6)
        C_0))

(define C_0 (+ 1 6))

;; write JUST THE LIFTED DEFINITIONS ABOVE HERE



#| ;DO ANY SCRATCH WORK BELOW THIS LINE


|# ;DO ANY SCRATCH WORK ABOVE THIS LINE
