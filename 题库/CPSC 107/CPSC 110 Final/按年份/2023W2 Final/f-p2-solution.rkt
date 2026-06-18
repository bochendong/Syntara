;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p2-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment exams/2023w2-f/f-p2) ;Do not edit or remove this tag



(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this linegg


(define CUTOFF 5)       ;(<= r CUTOFF) is trivial case
(define DIVISOR 1.618)  ;(/ r DIVISOR) is reduction step


(@htdf spiral)
(@signature Number Color -> Image)
;; Produce a spiral from wedges with largest radius r and color c

(check-expect (spiral (sub1 CUTOFF) "red")
              (wedge (sub1 CUTOFF) 90 "outline" "red"))
(check-expect (spiral CUTOFF "red")
              (wedge CUTOFF 90 "outline" "red"))
(check-expect (spiral (* CUTOFF DIVISOR) "green")
              (beside/align "top"
                            (rotate 90 (spiral CUTOFF "green"))
                            (wedge (* DIVISOR CUTOFF) 90 "outline" "green")))
(check-expect (spiral (* CUTOFF DIVISOR DIVISOR) "red")
              (beside/align "top"
                            (rotate 90 (spiral (* DIVISOR CUTOFF) "red"))
                            (wedge (* CUTOFF DIVISOR DIVISOR) 90 "outline"
                                   "red")))

;(define (spiral r c) empty-image)

(@template-origin genrec)

(define (spiral r c)
  ;; trivial:   r <= CUTOFF
  ;; reduction: r / DIVISOR
  ;; argument:  if CUTOFF > 0, DIVISOR > 1, and r >= 0 then repeated
  ;;            division of r by DIVISOR eventually results in r <= CUTOFF
  (if (<= r CUTOFF)
      (wedge r 90 "outline" c)
      (beside/align "top"
                    (rotate 90 (spiral (/ r DIVISOR) c))
                    (wedge r 90 "outline" c))))

