;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p6-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #f)))
(require spd/tags)

(@assignment exams/2023w1-f/f-p5) ;Do not edit or remove this tag



(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line



(@htdf drained-centimeters)

(@signature (listof Number) -> Number)
;; produce total centimeters drained from list of distances
;; CONSTRAINT: lon must not be empty, and every number in lon must be >=0

(check-expect (drained-centimeters (list 10))         10)
(check-expect (drained-centimeters (list 10 12 14))   (+ 10 10 10))
(check-expect (drained-centimeters (list 10 5 3))     (+ 10 5 3))
(check-expect (drained-centimeters (list 10 3 5))     (+ 10 3 3))
(check-expect (drained-centimeters (list  8 4 6 2 7)) (+ 8 4 4 2 2))

(@template-origin (listof X) accumulator)

(define (drained-centimeters lon0)
  ;; water can't drain past a highmark, so the minimum distance to the
  ;; left of a tank is how far that tank can drain
  ;;
  ;; msf is Number; minimum distance seen so far
  ;; rsf is Number; sum of drained centimeters so far
  ;;                at each number (min msf dn) is added
  (local [(define (drained-centimeters lon msf rsf)
            (cond [(empty? lon) rsf]
                  [else
                   (drained-centimeters (rest lon)
                                        (min msf (first lon))
                                        (+ rsf (min msf (first lon))))]))]
    
    (drained-centimeters (rest lon0) (first lon0) (first lon0))))
