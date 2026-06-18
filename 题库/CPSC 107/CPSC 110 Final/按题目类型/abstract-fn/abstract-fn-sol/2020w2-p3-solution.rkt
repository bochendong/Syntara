;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname 2020w2-p3-solution) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)
(require 2htdp/image)

(@assignment f-p3)

(@cwl ???)   ;fill in your CWL here (same CWL you put for problem sets)

(@problem 1) ;This is actually problem 3, DO NOT EDIT OR DELETE THIS LINE!

(@htdf stacked-e-squares)
(@signature (listof Color) Natural -> Image)
;; produce stack of solid squares of size n for just colors that end with "e"

(check-expect (stacked-e-squares empty 10) empty-image)
(check-expect (stacked-e-squares (list "blue") 20) (square 20 "solid" "blue"))
(check-expect (stacked-e-squares (list "blue" "red") 20)
              (square 20 "solid" "blue"))
(check-expect (stacked-e-squares (list "blue" "red" "purple" "green") 20)
              (above (square 20 "solid" "blue")
                     (square 20 "solid" "purple")))
(check-expect (stacked-e-squares (list "red" "green" "grey") 20)
              empty-image)


(@template-origin use-abstract-fn fn-composition)

(define (stacked-e-squares loc n)
  (local [(define (fn c)
            (string=? "e" (substring c (sub1 (string-length c)))))
          (define (fn2 c)
            (square n "solid" c))]
    (foldr above empty-image (map fn2 (filter fn loc)))))


