;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-beginner-reader.ss" "lang")((modname lab-01-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
;; DO NOT PUT ANY PERSONALLY IDENTIFYING BEYOND YOUR CWL IN THIS FILE.
;; YOUR CWL WILL BE SUFFICIENT TO IDENTIFY YOU
;; DO NOT PUT ANYTHING BUT TEXT IN THIS FILE. (NO COMMENT BOXES,
;; NO IMAGES.)

(require spd/tags)
(require 2htdp/image)
    
(@assignment 107/labs/lab-01)  ;Do not edit or remove this tag
(@cwl ???)                     ;Replace ??? with your cwl
    


(require 2htdp/image)
(require spd/tags)

;; CPSC 107 - Intro Lab

;; PART 1 - BSL Expressions

(@problem 1)
;; Complete Problem 1 below using the following constants

(define PREFIX "hello")
(define SUFFIX "world")

(string-append PREFIX "_" SUFFIX)




(@problem 2)
;; Complete Problem 2 below using the following constants

(define STR "helloworld")
(define I 5)

(string-append (substring STR 0 I) "_" (substring STR I))




(@problem 3)
;; Complete Problem 3 below using the following constant
(define CAT (bitmap/url "https://cs110.students.cs.ubc.ca/labs/cat.png"))

(* (image-height CAT) (image-width CAT))





(@problem 4)
;; Complete Problem 4 below using CAT as defined above
;; 如果猫的宽度大于高度; "wide"
;; 如果猫的高度大于宽度; "tall"
;; 如果猫的高度等于宽度; "square"

(if (> (image-height CAT) (image-width CAT))
    "tall" ;; True Answer
    (if (< (image-height CAT) (image-width CAT))
    "wide"
    "square")
    )





(@problem 5)
;; Complete Problem 5 below using STR as defined above
(string=? (substring STR 0 1) "h")




;; PART 2 - HtDF Problems

;; PROBLEM 6: Design a function called square? that consumes an image and 
;; determines whether the image's height is the same as the image's width.
(@problem 6)
(@htdf square?) ;!!!UNCOMMENT this line when you start on this function
(@signature Image -> Boolean)
;; determines whether the image's height is the same as the image's width
(check-expect (square? CAT) false)
(check-expect (square? empty-image) true)
(check-expect (square? (rectangle 10 10 "solid" "blue")) true)
(check-expect (square? (rectangle 10 20 "solid" "blue")) false)

; (define (square? img) false) ; stub

(@template-origin Image)
(@template
 (define (square? img)
    (... img)
   )
 )


(define (square? img)
  (= (image-width img) (image-height img))
  )




;; PROBLEM 7: A (much too) simple scheme for pluralizing words in English is to 
;; add an s at the end unless the word already ends in s.

;; Design a function that consumes a string, and adds s to the end unless 
;; the string already ends in s.
(@problem 7)
;(@htdf pluralize) ;!!!UNCOMMENT this line when you start on this function
(@signature String -> String)
; (define (pluralize word) " ") ; stub

(check-expect (pluralize "") "")
(check-expect (pluralize "apple") "apples")
(check-expect (pluralize "cats") "cats")

(@template-origin String)
(@template
 (define (pluralize word)
    (... word)
   )
 )

(define (pluralize word)
  (if (string=? word "")
      ""
      (if (string=? (substring word (- (string-length word) 1)) "s")
          word
          (string-append word "s")
          )
      ))



;; PROBLEM 8: Design a function called nth-char-equal? that consumes two strings
;; and a natural and produces true if the strings both have length greater 
;; than n and have the same character at position n.

;; Note, the signature for such a function is:

;; (@signature String String Natural -> Boolean)

;; The tag and template for such a function are:

;; (@template-origin String)

;; (define (nth-char-equal? s1 s2 n)
;;   (... s1 s2 n))

(@problem 8)
(@htdf nth-char-equal?) ;!!!UNCOMMENT this line when you start on this function
(@signature String String Natural -> Boolean)
;; determine if both strings have length greater than n and have the same character at position n.
(check-expect (nth-char-equal? "apple" "apple" 2) true)
(check-expect (nth-char-equal? "apple" "banana" 3) false)
(check-expect (nth-char-equal? "app" "banana" 5) false)
(check-expect (nth-char-equal? "banana" "app" 5) false)

; (define (nth-char-equal? s1 s2 n) true)

(@template-origin String)
(@template
 (define (nth-char-equal? s1 s2 n)
   (... s1 s2 n)))


(define (nth-char-equal? s1 s2 n)
   (and
    (> (string-length s1) n)
    (> (string-length s2) n)
    (string=? (substring s1 n (+ 1 n)) (substring s2 n (+ 1 n)))
    )
 )

