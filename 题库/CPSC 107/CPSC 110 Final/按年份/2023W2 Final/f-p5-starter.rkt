;; The first three lines of this file were inserted by DrRacket. They record metadata
;; about the language level of this file in a form that our tools can easily process.
#reader(lib "htdp-intermediate-lambda-reader.ss" "lang")((modname f-p5-starter) (read-case-sensitive #t) (teachpacks ()) (htdp-settings #(#t constructor repeating-decimal #f #t none #f () #t)))
(require spd/tags)

(@assignment exams/2023w2-f/f-p5) ;Do not edit or remove this tag

(@cwl ???)   ;fill in your CWL here (same as for problem sets)


(@problem 1) ;do not edit or delete this line
(@problem 2) ;do not edit or delete this line
(@problem 3) ;do not edit or delete this line
(@problem 4) ;do not edit or delete this line
(@problem 5) ;do not edit or delete this line

#|

 Carefully consider these data definitions, which are used in problems 5 and 6.

|#

(@htdd City Road)

(define-struct city (name gas roads))
(define-struct road (num distance to))

;; City is (make-city String Natural (listof Road))
;;
;; Road is (make-road Natural Natural String)
;;
;; interp.
;;  A GRAPH of cities connected by roads. Cities have names, and the
;;  maximum amount of gas one traveler can purchase. Roads have numbers
;;  and their distance.  It takes one unit of gas to travel one unit of
;;  distance. Note that:
;;
;;   - Roads only go one direction.
;;   - In any given map city names are unique.
;;   - In any given map road numbers are unique.
;;
(@template-origin encapsulated City (listof Road) Road)

(define (fn-for-city start map)
  (local [(define (fn-for-city c)
            (... (city-name c)
                 (city-gas c)
                 (fn-for-lor (city-roads c))))

          (define (fn-for-lor lor)
            (cond [(empty? lor) (...)]
                  [else
                   (... (fn-for-road (first lor))
                        (fn-for-lor (rest lor)))]))

          (define (fn-for-road r)
            (... (road-num r)
                 (road-distance r)
                 (fn-for-city (generate-city (road-to r) map))))]

    (fn-for-city (generate-city start map))))


;;
;; Because this is a graph a generative step is required in the traversal.
;; The function generate-city consumes a city name and a map and generates
;; the city with the given name.  As always, you should treat the Map type
;; as opaque - meaning there is no need to understand how it works inside.
;; All you need to know is that generate-city will operate properly, and
;; that the Map we are providing corresponds to the graph shown in
;; f-p5-6-figure.pdf. Also note that during testing we will call your
;; functions with a different map - do not submit functions that only work
;; on the example map.
;;
(@htdd Map)

(define MAP '(("Demacia"    30 ((15 30 "Ionia")
                                (26 10 "Targon")
                                (34 25 "Piltover")))
              ("Ionia"      20 ((11 5 "Zaun")
                                (48 20 "Targon")))
              ("Zaun"        1 ())
              ("Targon"     40 ((53 10 "Freljord")
                                (69 60 "Piltover")))
              ("Freljord"   50 ((72 10 "Ionia")))
              ("Piltover"   10 ((44 1000 "Bilgewater")))
              ("Bilgewater"  0 ())))



#|

 Complete the design of the following function, that tries to find a path from
 a start city to a destination city. We are giving you one sample check-expect
 and you will want to add more tests of your own.

 For this problem you can ignore gas completely.

 Your answer must include sufficient valid tests, a @template-origin and a
 correct function definition.

 This function does not require tail-recursion, do not make your solution more
 complicated than it needs to be.

 NOTE: This problem will be autograded, and ALL OF THE FOLLOWING ARE ESSENTIAL
       IN YOUR SOLUTION.  Failure to follow these requirements may result in
       receiving zero marks for this problem.

 - The function you design MUST BE CALLED find-path. 
 - You MUST FOLLOW all applicable design rules.
 - You MUST NOT EDIT any part of the file above the line marked with ***. 
   Really, we mean it, do not in any way whatsoever edit the file above the
   line marked with ***.
 - You MUST complete the function definition and then comment out the existing
   stub. Do not delete it.
 
 - You MUST USE the encapsulated templates above. 
 - You MUST NOT RENAME any of the local functions within those templates. 
 - You MUST NOT RENAME any of the parameters of those local functions.
 - You are allowed to add accumulator parameters to those functions.
 - You MUST USE ALL of the local functions within those templates.
 - You MUST NOT COMMENT out any @ metadata tags.
 
 - The file MUST NOT have any errors when the Check Syntax button is pressed.
   Press Check Syntax and Run often, and correct any errors early.


|#

; (define-struct city (name gas roads))
; (define-struct node (name edges))

; (define-struct road (num distance to))
; (define-struct edge (name to))

(@htdf find-path)
(@signature String String Map -> (listof Natural) or false)
;; Produce road numbers, in order, of first path found from start to dest
(check-expect (find-path "Demacia" "Piltover" MAP) (list 15 48 69))

;; *** do not edit above this line ***

(define (find-path start dest map0)
  (local
    [(define (neighbour-function-city city)
       (city-roads city)
       )

     (define (neighbour-function-road road)
       (generate-city (road-to road) map0)
       )
     

     (define (fn-for-road e epath)
       (local
         [(define name (road-num e))
          (define neighbour (neighbour-function-road e))
          (define new-path (append epath (list name)))
          ]
         (cond
           [(member? name epath) false]
           [else
            (fn-for-city neighbour new-path)
            ]
       )))

     (define (fn-for-loe loe epath)
       (cond
         [(empty? loe) false]
         [else
          (local
            [(define try (fn-for-road (first loe) epath))]
            (if (not (false? try))
                try
                (fn-for-loe (rest loe) epath)
                )
            )
          ]
       ))

     (define (fn-for-city city epath)
       (cond
         [(string=? (city-name city) dest) epath]
         [else (fn-for-loe (neighbour-function-city city)
                           epath)]
       ))
     ]

  (fn-for-city (generate-city start map0) empty)
  ))


;;
;; *** There is no need to read beyond this point in the file. ***
;;

(@htdf generate-city)
(@signature String Map -> City)
;; Given map and city name, generate corresponding city
(define (generate-city nm the-map)
  (if (not (map? the-map))
      (error 'generate-city "Second argument to generate-city is not a map.")
      (local [(define entry (assoc nm the-map))]
        (if (false? entry)
            (error 'generate-city (format "No city named ~s exists." nm))
            (make-city (first entry)
                       (second entry)
                       (map (lambda (re) (apply make-road re))
                            (third entry)))))))

(define (map? x)
  (and (list? x)
       (andmap city-entry? x)))

(define (city-entry? x)
  (and (list? x)
       (= (length x) 3)
       (string? (car x))
       (integer? (cadr x))
       (list? (caddr x))
       (andmap road-entry? (caddr x))))

(define (road-entry? x)
  (and (list? x)
       (= (length x) 3)
       (integer? (car x))
       (integer? (cadr x))
       (string? (caddr x))))
