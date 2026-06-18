;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2021w1-f/f-p6)

(@problem 1) ;do not edit or delete this tag
(@problem 2) ;do not edit or delete this tag
(@problem 3) ;do not edit or delete this tag
(@problem 4) ;do not edit or delete this tag
(@problem 5) ;do not edit or delete this tag
(@problem 6) ;do not edit or delete this tag

(@htdd Stuff)
(define-struct stuff (a b c))
;; Stuff is (make-stuff ...)


(@htdf fold-stuff)
(@signature (U Y Z -> X) (X Y -> Y) (Natural Z -> Z) Y Z Stuff -> X)

(define (fold-stuff c1 c2 c3 b1 b2 s0)
  (local [(define (foo s)
            (c1 (stuff-a s)
                (bar (stuff-b s))
                (baz (stuff-c s))))

          (define (bar los)
            (cond [(empty? los) b1]
                  [else
                   (c2 (foo (first los))
                        (bar (rest los)))]))

          (define (baz n)
            (cond [(zero? n) b2]
                  [else
                   (c3 n
                       (baz (sub1 n)))]))]

    (foo s0)))
